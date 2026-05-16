#!/bin/bash
set -eo pipefail

if [ -z "$1" ] || [ -z "$2" ]; then
  echo "Usage: bash afk.sh <tool> <iterations>"
  echo "Example: bash afk.sh codex 5"
  exit 1
fi

TOOL=$1
ITERATIONS=$2

if [[ "$TOOL" != "codex" && "$TOOL" != "gemini" ]]; then
  echo "Error: The first argument must be either 'codex' or 'gemini'."
  exit 1
fi

echo "Starting $ITERATIONS iterations using $TOOL..."

for ((i=1; i<=$ITERATIONS; i++)); do
  echo "--- Iteration $i ---"

  commits=$(git log -n 5 --format="%H%n%ad%n%B---" --date=short 2>/dev/null || echo "No commits found")
  issues=$(cat issues/*.md 2>/dev/null || echo "No issues found")
  prompt=$(cat ralph/prompt.md)
  
  FULL_PROMPT="Previous commits: $commits Issues: $issues $prompt"
  
  if [ "$TOOL" == "codex" ]; then
    result=$(codex exec "$FULL_PROMPT")
  elif [ "$TOOL" == "gemini" ]; then
    result=$(gemini-cli "$FULL_PROMPT") 
  fi
  
  echo "$result"

  if [[ "$result" == *"<promise>NO MORE TASKS</promise>"* ]]; then
    echo "Agent ($TOOL) reports all tasks complete! Exiting after $i iterations."
    exit 0
  fi
  
  echo "Iteration $i finished. Moving to next task..."
done

echo "Finished all $ITERATIONS iterations."