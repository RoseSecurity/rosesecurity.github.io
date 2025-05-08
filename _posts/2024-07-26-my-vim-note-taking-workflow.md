---
layout: post
title:  "My Neovim Note-taking Workflow"
tags: neovim vim editor ide
---

## Past Strategies

Recently, I've overhauled my development workflow, moving towards a more minimalist, command-line interface (CLI) based approach. This transition was motivated by a desire to deepen my understanding of the tools I use every day. This post details some of the changes I've made, with a focus on how I've adapted my note-taking process to this new paradigm.

Prior to this shift, my note-taking process primarily relied on tools such as Obsidian for markdown rendering and a later evolution to numerous JetBrains and VS Code plugins for in-IDE note capture. However, the move to a terminal-centric workflow required a new approach to note-taking that could seamlessly integrate with my development environment (Neovim).

## Telekasten

After evaluating various options, I settled on Telekasten, a Neovim plugin that combines powerful markdown editing capabilities with journaling features.My only requirements were that the tool should make capturing daily notes simple while integrating with Neovim (particulary Telescope or FZF).  Telekasten integrates seamlessly with Telescope and the setup process is straightforward:

1. Install the plugin: `Plug 'renerocksai/telekasten.nvim'`
2. Configure in `init.lua`:

```sh
require('telekasten').setup({
  home = vim.fn.expand("~/worklog/notes"), -- Put the name of your notes directory here
})
```

This configuration enables a range of note-taking commands accessible via `:Telekasten`, including `search_notes`, `find_daily_notes`, and `goto_today`. As an aside, I later mapped the Telekasten command to `:Notes`, as it felt more intuitive to me. When creating new notes, the resulting directory structure is clean and organized:

```console
❯ ls ~/worklog/notes
2024-07-24.md  2024-07-25.md  2024-07-26.md
```

## Another Layer

To further improve this system, I developed a Go program to compile weekly and monthly notes. The tool serves two primary purposes:

1. It provides an overview of work completed over longer periods
2. It generates summaries that can be useful for performance reviews and team check-ins (my long term goal is to harness AI to generate summaries of my worklogs through this tooling)

Here is the code!

```go
package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// This program compiles weekly or monthly notes into a single file.
// The compiled notes can be further parsed by AI to summarize weekly and monthly worklogs.
// Ensure that the NOTES environment variable is set to your notes directory before running the program.

var (
	weekly  bool // Flag to indicate weekly compilation
	monthly bool // Flag to indicate monthly compilation
)

func main() {
	// Get environment variable for the notes directory
	notesDir := os.Getenv("NOTES")
	compiledNotesDir := notesDir + "/compiled_notes"

	// Create the compiled notes directory if it doesn't exist
	if _, err := os.Stat(compiledNotesDir); os.IsNotExist(err) {
		os.Mkdir(compiledNotesDir, 0755)
	}

	// Parse command-line flags for weekly or monthly notes compilation
	flag.BoolVar(&weekly, "weekly", false, "Compile weekly notes")
	flag.BoolVar(&monthly, "monthly", false, "Compile monthly notes")
	flag.Parse()

	// Execute the appropriate compilation based on the provided flag
	if weekly {
		fmt.Println("Compiling weekly notes...")
		compileWeeklyNotes(notesDir, compiledNotesDir)
	} else if monthly {
		fmt.Println("Compiling monthly notes...")
		compileMonthlyNotes(notesDir, compiledNotesDir)
	} else {
		fmt.Println("No flag provided. Please provide either -weekly or -monthly")
	}
}

// compileWeeklyNotes compiles notes for the current week
func compileWeeklyNotes(notesDir, compiledNotesDir string) {
	// Get the current date and calculate the start of the week
	now := time.Now()
	weekday := int(now.Weekday())
	offset := (weekday + 6) % 7
	start := now.AddDate(0, 0, -offset)
	start = time.Date(start.Year(), start.Month(), start.Day(), 0, 0, 0, 0, time.Local)

	// Get all the notes for the week
	notes := getNotes(notesDir, start, now)

	// Compile the notes into a single file
	content := compileNotes(notes)

	// Write the compiled notes to a file
	filename := fmt.Sprintf("%s/weekly_notes_%s.md", compiledNotesDir, start.Format("2006-01-02"))
	err := os.WriteFile(filename, []byte(content), 0644)
	if err != nil {
		fmt.Printf("Error writing file: %v\n", err)
		return
	}

	fmt.Printf("Weekly notes compiled and saved to %s\n", filename)
}

// compileMonthlyNotes compiles notes for the current month
func compileMonthlyNotes(notesDir, compiledNotesDir string) {
	// Get the current date and calculate the start and end of the month
	now := time.Now()
	start := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.Local)
	end := start.AddDate(0, 1, -1)

	// Get all the notes for the month
	notes := getNotes(notesDir, start, end)

	// Compile the notes into a single file
	content := compileNotes(notes)

	// Write the compiled notes to a file
	filename := fmt.Sprintf("%s/monthly_notes_%s.md", compiledNotesDir, start.Format("2006-01"))
	err := os.WriteFile(filename, []byte(content), 0644)
	if err != nil {
		fmt.Printf("Error writing file: %v\n", err)
		return
	}

	fmt.Printf("Monthly notes compiled and saved to %s\n", filename)
}

// getNotes retrieves all markdown files within the specified date range
func getNotes(notesDir string, start, end time.Time) []string {
	var notes []string

	err := filepath.Walk(notesDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		if !info.IsDir() && strings.HasSuffix(info.Name(), ".md") {
			date, err := time.Parse("2006-01-02.md", info.Name())
			if err == nil && (date.Equal(start) || date.After(start)) && (date.Equal(end) || date.Before(end)) {
				notes = append(notes, path)
			}
		}

		return nil
	})

	if err != nil {
		fmt.Printf("Error walking through directory: %v\n", err)
	}

	sort.Strings(notes)
	return notes
}

// compileNotes combines the content of multiple note files into a single string
func compileNotes(notes []string) string {
	var content strings.Builder

	for _, note := range notes {
		data, err := os.ReadFile(note)
		if err != nil {
			fmt.Printf("Error reading file %s: %v\n", note, err)
			continue
		}

		filename := filepath.Base(note)
		content.WriteString(fmt.Sprintf("## %s\n\n", strings.TrimSuffix(filename, ".md")))
		content.Write(data)
		content.WriteString("\n")
	}

	return content.String()
}
```

To integrate this tool with Neovim, I added the following commands to my configuration:

> :bulb: I compiled this binary as `note-compiler`

```lua
" Define the :CompileNotesWeekly command to run note-compiler -weekly
command! CompileNotesWeekly call system('note-compiler -weekly')

" Define the :CompileNotesMonthly command to run note-compiler -monthly
command! CompileNotesMonthly call system('note-compiler -monthly')
```

These commands allow for easy note compilation directly from within Neovim.

The implementation of this system results in a well-organized directory structure:

```console
❯ tree
.
├── 2024-07-24.md
├── 2024-07-25.md
├── 2024-07-26.md
├── compiled_notes
│   └── weekly_notes_2024-07-22.md
```

## Conclusion

If you're looking to streamline your note-taking, I would highly recommend looking into Telekasten (as I have barely scratched the surface of its abilities)! The transition to a CLI-based development workflow has not only boosted my productivity but has also rekindled my passion for the technology I use daily. I wholeheartedly endorse this approach for developers looking to deepen their connection with their tools and streamline their workflow. Let's get building!
