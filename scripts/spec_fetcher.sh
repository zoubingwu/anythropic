#!/bin/bash

# Set download directory
OUTPUT_DIR="llm_specs"
mkdir -p "$OUTPUT_DIR"

echo "📂 Preparing to download API specs to: $OUTPUT_DIR"
echo "-------------------------------------"

# Check required tools
if ! command -v gh &> /dev/null; then
    echo "❌ Error: 'gh' command not found. Please install GitHub CLI."
    exit 1
fi
if ! command -v grep &> /dev/null || ! command -v awk &> /dev/null; then
    echo "❌ Error: 'grep' or 'awk' not found. Needed for parsing URLs."
    exit 1
fi

# -------------------------------------------------------
# 1. OpenAI (Targeting the 'manual_spec' branch)
# -------------------------------------------------------
echo "⬇️  [1/3] Fetching OpenAI OpenAPI spec (branch: manual_spec)..."
gh api \
  -H "Accept: application/vnd.github.v3.raw" \
  "/repos/openai/openai-openapi/contents/openapi.yaml?ref=manual_spec" \
  > "$OUTPUT_DIR/openai_openapi.yaml"

if [ $? -eq 0 ]; then echo "✅ OpenAI downloaded successfully"; else echo "❌ OpenAI download failed"; fi


# -------------------------------------------------------
# 2. Anthropic / Claude (Dynamic fetch via .stats.yml)
# -------------------------------------------------------
echo "⬇️  [2/3] Fetching Anthropic/Claude spec..."

# Step A: Get the metadata file containing the URL
STATS_FILE="$OUTPUT_DIR/.temp_anthropic_stats.yml"
gh api \
  -H "Accept: application/vnd.github.v3.raw" \
  /repos/anthropics/anthropic-sdk-typescript/contents/.stats.yml \
  > "$STATS_FILE"

# Step B: Extract the 'openapi_spec_url' from the YAML
# Looks for line starting with "openapi_spec_url:", prints the second column
SPEC_URL=$(grep "openapi_spec_url:" "$STATS_FILE" | awk '{print $2}')

if [ -z "$SPEC_URL" ]; then
    echo "❌ Error: Could not extract URL from Anthropic stats file."
else
    echo "   🔗 Found URL: $SPEC_URL"
    # Step C: Download the actual spec from the extracted URL
    curl -s "$SPEC_URL" > "$OUTPUT_DIR/anthropic_openapi.json"

    if [ $? -eq 0 ]; then
        echo "✅ Anthropic downloaded successfully";
    else
        echo "❌ Anthropic download failed";
    fi
fi

# Clean up temp file
rm -f "$STATS_FILE"


# -------------------------------------------------------
# 3. Google Gemini (Google Discovery API)
# -------------------------------------------------------
echo "⬇️  [3/3] Fetching Google Gemini spec (rest.json)..."
if command -v curl &> /dev/null; then
    curl -s "https://generativelanguage.googleapis.com/\$discovery/rest?version=v1beta" \
    > "$OUTPUT_DIR/gemini_discovery.json"
    echo "✅ Gemini downloaded successfully (Format: Google Discovery)"
else
    echo "❌ Error: 'curl' not found, skipping Gemini."
fi

echo "-------------------------------------"
echo "🎉 All tasks completed! File list:"
ls -lh "$OUTPUT_DIR"
