package catalog

import (
	"context"
	"database/sql"
	"errors"
)

// ObserveLocalFile preserves ready assets for unchanged files, and invalidates
// derived media when a local source is replaced at the same path.
func (c *Catalog) ObserveLocalFile(ctx context.Context, videoID, driveID, fileID string, size, modifiedNS int64) (bool, error) {
	tx, err := c.db.BeginTx(ctx, nil)
	if err != nil {
		return false, err
	}
	defer tx.Rollback()
	var previousSize, previousTime int64
	err = tx.QueryRowContext(ctx, `SELECT size_bytes, modified_ns FROM scan_file_versions WHERE drive_id=? AND file_id=?`, driveID, fileID).Scan(&previousSize, &previousTime)
	changed := false
	if errors.Is(err, sql.ErrNoRows) {
		if err := tx.QueryRowContext(ctx, `SELECT size_bytes FROM videos WHERE id=?`, videoID).Scan(&previousSize); err != nil {
			return false, err
		}
		changed = previousSize != size
	} else if err != nil {
		return false, err
	} else {
		changed = previousSize != size || previousTime != modifiedNS
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO scan_file_versions(drive_id,file_id,size_bytes,modified_ns) VALUES(?,?,?,?) ON CONFLICT(drive_id,file_id) DO UPDATE SET size_bytes=excluded.size_bytes, modified_ns=excluded.modified_ns`, driveID, fileID, size, modifiedNS); err != nil {
		return false, err
	}
	if changed {
		_, err = tx.ExecContext(ctx, `UPDATE videos SET size_bytes=?, content_hash='', sampled_sha256='', fingerprint_status='pending', fingerprint_error='', thumbnail_status='pending', thumbnail_url='', thumbnail_failures=0, preview_status='pending', preview_local='', duration_seconds=0 WHERE id=?`, size, videoID)
		if err != nil {
			return false, err
		}
	}
	return changed, tx.Commit()
}
