package catalog

import (
	"context"
	"path/filepath"
	"testing"
)

func TestObserveLocalFileInvalidatesOnlyChangedSources(t *testing.T) {
	cat, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer cat.Close()
	ctx := context.Background()
	if err := cat.UpsertVideo(ctx, &Video{ID: "test", DriveID: "local", FileID: "file", Title: "test", Size: 100, PreviewStatus: "ready", PreviewLocal: "test.mp4"}); err != nil {
		t.Fatal(err)
	}
	for _, step := range []struct {
		stamp   int64
		changed bool
	}{{1, false}, {1, false}, {2, true}, {2, false}} {
		changed, err := cat.ObserveLocalFile(ctx, "test", "local", "file", 100, step.stamp)
		if err != nil || changed != step.changed {
			t.Fatalf("stamp=%d changed=%v err=%v", step.stamp, changed, err)
		}
	}
	v, err := cat.GetVideo(ctx, "test")
	if err != nil {
		t.Fatal(err)
	}
	if v.PreviewStatus != "pending" || v.PreviewLocal != "" {
		t.Fatal("changed source retained stale preview")
	}
}

func TestVideoSearchMatchesParentFolder(t *testing.T) {
	cat, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer cat.Close()
	ctx := context.Background()
	if err := cat.UpsertVideo(ctx, &Video{ID: "folder-video", DriveID: "local", FileID: "file", Title: "Clip", DirName: "Travel2026", AncestorDirNames: []string{"FamilyArchive", "Travel2026"}}); err != nil {
		t.Fatal(err)
	}
	for _, keyword := range []string{"Travel2026", "FamilyArchive"} {
		items, total, err := cat.ListVideos(ctx, ListParams{Keyword: keyword, Page: 1, PageSize: 10})
		if err != nil || total != 1 || len(items) != 1 {
			t.Fatalf("keyword=%s count=%d err=%v", keyword, total, err)
		}
	}
}
