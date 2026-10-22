package main

import (
	"database/sql"
	"gopkg.in/yaml.v3"
	"os"
	"path/filepath"
	"testing"
)

func TestBudgetDisablesOnlyPreviewGeneration(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "data", "previews")
	if err := os.MkdirAll(dir, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "sample.mp4"), make([]byte, 2048), 0600); err != nil {
		t.Fatal(err)
	}
	config := []byte("preview:\n  enabled: true\nserver:\n  listen: 127.0.0.1:9191\n")
	path := filepath.Join(root, "config.yaml")
	if err := os.WriteFile(path, config, 0600); err != nil {
		t.Fatal(err)
	}
	if err := enforceBudget(root, 1); err != nil {
		t.Fatal(err)
	}
	b, _ := os.ReadFile(path)
	if string(b) != string(config) {
		t.Fatal("config changed below quota")
	}
	if err := enforceBudget(root, 0.000001); err != nil {
		t.Fatal(err)
	}
	b, _ = os.ReadFile(path)
	var doc struct {
		Preview struct{ Enabled bool }
		Server  struct{ Listen string }
	}
	if err := yaml.Unmarshal(b, &doc); err != nil {
		t.Fatal(err)
	}
	if doc.Preview.Enabled || doc.Server.Listen != "127.0.0.1:9191" {
		t.Fatal("quota changed unrelated settings")
	}
	if err := enforceBudget(root, 0.000001); err != nil {
		t.Fatal(err)
	}
}

func TestBackupCreatesReadableSnapshot(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "data"), 0700); err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("sqlite", filepath.Join(root, "data", "video-site.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec("CREATE TABLE sample(value TEXT); INSERT INTO sample VALUES('preserved')"); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "config.yaml"), []byte("preview: {enabled: true}"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := backup(root, 14); err != nil {
		t.Fatal(err)
	}
	paths, err := filepath.Glob(filepath.Join(root, "backups", "*.db"))
	if err != nil || len(paths) != 1 {
		t.Fatal("snapshot missing", err)
	}
	snapshot, err := sql.Open("sqlite", paths[0])
	if err != nil {
		t.Fatal(err)
	}
	defer snapshot.Close()
	var value string
	if err := snapshot.QueryRow("SELECT value FROM sample").Scan(&value); err != nil || value != "preserved" {
		t.Fatal("snapshot is not readable", err)
	}
	if err := backup(root, 14); err != nil {
		t.Fatal(err)
	}
}

func TestClearPreviewsRetainsOriginalsAndRejectsOutsidePaths(t *testing.T) {
	root := t.TempDir()
	base := filepath.Join(root, "data", "previews")
	if err := os.MkdirAll(filepath.Join(base, "thumbs"), 0700); err != nil {
		t.Fatal(err)
	}
	original := filepath.Join(root, "original.mp4")
	cover := filepath.Join(base, "thumbs", "cover.webp")
	preview := filepath.Join(base, "preview.mp4")
	for _, path := range []string{original, cover, preview} {
		if err := os.WriteFile(path, []byte("test"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	db, err := openTestPreviewDB(root)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec("INSERT INTO videos VALUES('clip',?,'ready',1)", preview); err != nil {
		t.Fatal(err)
	}
	if err := clearIndexedPreviews(root); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(preview); !os.IsNotExist(err) {
		t.Fatal("preview not removed")
	}
	for _, path := range []string{original, cover} {
		if _, err := os.Stat(path); err != nil {
			t.Fatal("original or cover removed", err)
		}
	}
	if _, err := db.Exec("UPDATE videos SET preview_local=?", original); err != nil {
		t.Fatal(err)
	}
	if err := clearIndexedPreviews(root); err == nil {
		t.Fatal("outside path accepted")
	}
	if _, err := os.Stat(original); err != nil {
		t.Fatal("outside file removed")
	}
}

func openTestPreviewDB(root string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", filepath.Join(root, "data", "video-site.db"))
	if err != nil {
		return nil, err
	}
	_, err = db.Exec("CREATE TABLE videos(id TEXT PRIMARY KEY,preview_local TEXT,preview_status TEXT,preview_updated_at INTEGER)")
	return db, err
}
