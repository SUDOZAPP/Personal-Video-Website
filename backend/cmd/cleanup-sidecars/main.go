package main

import (
 "context"
 "database/sql"
 "encoding/json"
 "fmt"
 "os"
 "github.com/video-site/backend/internal/catalog"
)

func main() {
 if len(os.Args) != 2 { panic("database path required") }
 path := os.Args[1]
 db, err := sql.Open("sqlite", path)
 if err != nil { panic(err) }
 rows, err := db.Query(`SELECT id FROM videos WHERE drive_id = 'f-video' AND substr(file_name, 1, 2) = '._'`)
 if err != nil { panic(err) }
 var ids []string
 for rows.Next() { var id string; if err := rows.Scan(&id); err != nil { panic(err) }; ids = append(ids, id) }
 if err := rows.Err(); err != nil { panic(err) }
 rows.Close(); db.Close()
 manifest, err := json.MarshalIndent(ids, "", "  ")
 if err != nil { panic(err) }
 if err := os.WriteFile(path+".sidecar-cleanup.json", manifest, 0600); err != nil { panic(err) }
 cat, err := catalog.Open(path)
 if err != nil { panic(err) }
 defer cat.Close()
 for _, id := range ids { if err := cat.DeleteVideo(context.Background(), id); err != nil { panic(err) } }
 fmt.Printf("Removed %d metadata-only catalog entries; source files untouched.\n", len(ids))
}
