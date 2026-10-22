package main

import "testing"

func TestDirectoryReadDuringPendingConfiguration(t *testing.T) {
	g := newDriveOperationGate()
	g.pending = true
	g.beginBlockedLocked()
	release, generation, ok := g.tryBeginDirectoryRead()
	if !ok || generation != 1 || g.active != 1 {
		t.Fatal("read should hold the mounted generation while configuration is pending")
	}
	release()
	if g.active != 0 { t.Fatal("read lease was not released") }
	for _, state := range []string{"applying", "deleting", "retired", "stopped"} {
		g.applying = state == "applying"
		g.deleting = state == "deleting"
		g.retired = state == "retired"
		g.pending = state != "stopped"
		if release, _, ok := g.tryBeginDirectoryRead(); ok {
			release()
			t.Fatalf("read admitted while %s", state)
		}
	}
}
