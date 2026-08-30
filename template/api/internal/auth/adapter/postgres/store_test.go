package postgres

import (
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"testing"
)

func TestExpectedMigrationVersionMatchesBundledFiles(t *testing.T) {
	_, source, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller could not locate test source")
	}
	files, err := filepath.Glob(filepath.Join(filepath.Dir(source), "..", "..", "..", "..", "migrations", "*.up.sql"))
	if err != nil {
		t.Fatal(err)
	}
	var highest int64
	for _, file := range files {
		prefix, _, ok := strings.Cut(filepath.Base(file), "_")
		if !ok {
			t.Fatalf("migration filename has no version prefix: %s", file)
		}
		version, err := strconv.ParseInt(prefix, 10, 64)
		if err != nil {
			t.Fatalf("migration filename has invalid version: %s", file)
		}
		if version > highest {
			highest = version
		}
	}
	if highest != ExpectedMigrationVersion {
		t.Fatalf("highest migration version = %d, expected constant = %d", highest, ExpectedMigrationVersion)
	}
}
