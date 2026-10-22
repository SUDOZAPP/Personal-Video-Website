package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"net"
	"os"
	"path/filepath"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
	_ "modernc.org/sqlite"
)

type settings struct {
	PreviewLimitGB float64 `json:"preview_limit_gb"`
	BackupKeepDays int     `json:"backup_keep_days"`
}

func loadSettings(root string) (settings, error) {
	s := settings{2, 14}
	b, err := os.ReadFile(filepath.Join(root, "maintenance.json"))
	if errors.Is(err, os.ErrNotExist) {
		return s, nil
	}
	if err != nil {
		return s, err
	}
	if err = json.Unmarshal(b, &s); err != nil {
		return s, err
	}
	if s.PreviewLimitGB < 0 || s.BackupKeepDays < 1 || s.BackupKeepDays > 365 {
		return s, fmt.Errorf("invalid maintenance settings")
	}
	return s, nil
}

func openDB(root string) (*sql.DB, error) {
	path := filepath.Join(root, "data", "video-site.db")
	if _, err := os.Stat(path); err != nil {
		return nil, err
	}
	return sql.Open("sqlite", path+"?_pragma=busy_timeout(5000)")
}

func backup(root string, keep int, force ...bool) error {
	dir := filepath.Join(root, "backups")
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	stamp := time.Now().Format("2006-01-02")
	if len(force) > 0 && force[0] {
		stamp = time.Now().Format("2006-01-02-150405.000")
	}
	dst := filepath.Join(dir, stamp+".db")
	if _, err := os.Stat(dst); err == nil {
		return nil
	}
	db, err := openDB(root)
	if err != nil {
		return err
	}
	defer db.Close()
	temp := dst + ".partial"
	if _, err := os.Stat(temp); err == nil {
		if err := os.Remove(temp); err != nil {
			return err
		}
	}
	if _, err := db.Exec("VACUUM INTO '" + strings.ReplaceAll(temp, "'", "''") + "'"); err != nil {
		return err
	}
	check, err := sql.Open("sqlite", temp)
	if err != nil {
		return err
	}
	var integrity string
	err = check.QueryRow("PRAGMA integrity_check").Scan(&integrity)
	check.Close()
	if err != nil {
		return err
	}
	if integrity != "ok" {
		return fmt.Errorf("backup integrity: %s", integrity)
	}
	if err := os.Rename(temp, dst); err != nil {
		return err
	}
	config, err := os.ReadFile(filepath.Join(root, "config.yaml"))
	if err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(dir, stamp+".yaml"), config, 0600); err != nil {
		return err
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	cutoff := time.Now().AddDate(0, 0, -keep)
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		ext := filepath.Ext(entry.Name())
		if ext != ".db" && ext != ".yaml" {
			continue
		}
		name := strings.TrimSuffix(entry.Name(), ext)
		if len(name) < 10 {
			continue
		}
		date, err := time.ParseInLocation("2006-01-02", name[:10], time.Local)
		if err == nil && date.Before(cutoff) {
			if err := os.Remove(filepath.Join(dir, entry.Name())); err != nil {
				return err
			}
		}
	}
	fmt.Println("Database backup verified:", dst)
	return nil
}

func previewBytes(root string) (int64, error) {
	var total int64
	err := filepath.WalkDir(filepath.Join(root, "data", "previews"), func(path string, d fs.DirEntry, err error) error {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		if err != nil {
			return err
		}
		if d.IsDir() {
			if d.Name() == "thumbs" {
				return filepath.SkipDir
			}
			return nil
		}
		if d.Type().IsRegular() {
			info, err := d.Info()
			if err != nil {
				return err
			}
			total += info.Size()
		}
		return nil
	})
	return total, err
}

func enforceBudget(root string, limit float64) error {
	if limit == 0 {
		return nil
	}
	bytes, err := previewBytes(root)
	if err != nil {
		return err
	}
	if bytes < int64(limit*1024*1024*1024) {
		return nil
	}
	path := filepath.Join(root, "config.yaml")
	raw, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	var node yaml.Node
	if err := yaml.Unmarshal(raw, &node); err != nil {
		return err
	}
	if len(node.Content) == 0 {
		return fmt.Errorf("empty config")
	}
	doc := node.Content[0]
	for i := 0; i+1 < len(doc.Content); i += 2 {
		if doc.Content[i].Value != "preview" {
			continue
		}
		preview := doc.Content[i+1]
		for j := 0; j+1 < len(preview.Content); j += 2 {
			if preview.Content[j].Value == "enabled" {
				enabled := preview.Content[j+1]
				if enabled.Value == "false" {
					return nil
				}
				enabled.Value = "false"
				enabled.Tag = "!!bool"
				out, err := yaml.Marshal(&node)
				if err != nil {
					return err
				}
				// Avoid overwriting an administrator's concurrent edit.
				current, err := os.ReadFile(path)
				if err != nil {
					return err
				}
				if string(current) != string(raw) {
					return fmt.Errorf("config changed during quota check; will retry")
				}
				temp := path + ".maintenance.tmp"
				if err := os.WriteFile(temp, out, 0600); err != nil {
					return err
				}
				if err := os.Rename(temp, path); err != nil {
					return err
				}
				fmt.Println("Preview budget reached; preview generation disabled. Covers and original videos remain available.")
				return nil
			}
		}
	}
	return fmt.Errorf("preview.enabled missing from config")
}

func clearPreviews(root string) error {
	connection, err := net.DialTimeout("tcp", "127.0.0.1:9191", time.Second)
	if err == nil {
		connection.Close()
		return fmt.Errorf("stop the video server before clearing previews")
	}
	if err := backup(root, 14, true); err != nil {
		return err
	}
	return clearIndexedPreviews(root)
}

func clearIndexedPreviews(root string) error {
	db, err := openDB(root)
	if err != nil {
		return err
	}
	defer db.Close()
	rows, err := db.Query("SELECT id,preview_local FROM videos WHERE COALESCE(preview_local,'')<>''")
	if err != nil {
		return err
	}
	type asset struct{ id, path string }
	var assets []asset
	base := filepath.Join(root, "data", "previews")
	for rows.Next() {
		var a asset
		if err := rows.Scan(&a.id, &a.path); err != nil {
			return err
		}
		if !filepath.IsAbs(a.path) {
			a.path = filepath.Join(base, a.path)
		}
		rel, err := filepath.Rel(base, a.path)
		if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) || strings.Contains(rel, string(filepath.Separator)) || !strings.EqualFold(filepath.Ext(a.path), ".mp4") {
			rows.Close()
			return fmt.Errorf("unsafe preview path")
		}
		info, err := os.Lstat(a.path)
		if err == nil && !info.Mode().IsRegular() {
			rows.Close()
			return fmt.Errorf("preview is not a regular file")
		}
		if err != nil && !os.IsNotExist(err) {
			rows.Close()
			return err
		}
		assets = append(assets, a)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	rows.Close()
	for _, a := range assets {
		// Clear the URL first, so interrupted cleanup cannot advertise a deleted asset.
		if _, err := db.Exec("UPDATE videos SET preview_local='',preview_status='pending',preview_updated_at=0 WHERE id=?", a.id); err != nil {
			return err
		}
		if err := os.Remove(a.path); err != nil && !os.IsNotExist(err) {
			return err
		}
	}
	fmt.Printf("Cleared %d generated previews. Original videos and covers retained.\n", len(assets))
	return nil
}

func run() error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	root := filepath.Dir(exe)
	if len(os.Args) != 2 {
		return fmt.Errorf("usage: maintenance.exe status|backup|watch|clear-previews")
	}
	s, err := loadSettings(root)
	if err != nil {
		return err
	}
	switch os.Args[1] {
	case "status":
		bytes, err := previewBytes(root)
		fmt.Printf("Previews: %.2f GiB / %.2f GiB; backups: %d days\n", float64(bytes)/(1024*1024*1024), s.PreviewLimitGB, s.BackupKeepDays)
		return err
	case "backup":
		return backup(root, s.BackupKeepDays, true)
	case "clear-previews":
		return clearPreviews(root)
	case "watch":
		failures := 0
		for {
			connection, err := net.DialTimeout("tcp", "127.0.0.1:9191", time.Second)
			if err != nil {
				failures++
				if failures >= 3 {
					return nil
				}
			} else {
				connection.Close()
				failures = 0
				if updated, err := loadSettings(root); err == nil {
					s = updated
				} else {
					fmt.Println(err)
				}
				if err := backup(root, s.BackupKeepDays); err != nil {
					fmt.Println("backup:", err)
				}
				if err := enforceBudget(root, s.PreviewLimitGB); err != nil {
					fmt.Println("budget:", err)
				}
			}
			time.Sleep(30 * time.Second)
		}
	default:
		return fmt.Errorf("unknown command")
	}
}
func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
