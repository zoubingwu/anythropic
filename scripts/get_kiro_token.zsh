#!/bin/zsh

# Kiro Token Manager
# Extract and exchange tokens from Kiro CLI SQLite database

function get_kiro_access_token() {
    local db_path="${HOME}/Library/Application Support/kiro-cli/data.sqlite3"
    local region="us-east-1"  # AWS SSO OIDC uses us-east-1 by default
    local sso_region=""

    # Query for device registration data (contains client credentials)
    local device_data
    device_data=$(sqlite3 "$db_path" "SELECT value FROM auth_kv WHERE key = 'kirocli:odic:device-registration' OR key = 'codewhisperer:odic:device-registration' LIMIT 1;")

    if [[ -z "$device_data" ]]; then
        echo "❌ No device registration data found in SQLite database"
        return 1
    fi

    # Query for token data (contains refresh token)
    local token_data
    token_data=$(sqlite3 "$db_path" "SELECT value FROM auth_kv WHERE key = 'kirocli:odic:token' OR key = 'codewhisperer:odic:token' LIMIT 1;")

    if [[ -z "$token_data" ]]; then
        echo "❌ No token data found in SQLite database"
        return 1
    fi

    # Extract credentials from device registration
    local client_id client_secret
    client_id=$(echo "$device_data" | jq -r '.client_id // empty')
    client_secret=$(echo "$device_data" | jq -r '.client_secret // empty')
    sso_region=$(echo "$device_data" | jq -r '.region // empty')

    # Extract refresh token from token data
    local refresh_token
    refresh_token=$(echo "$token_data" | jq -r '.refresh_token // empty')

    if [[ -z "$refresh_token" || -z "$client_id" || -z "$client_secret" ]]; then
        echo "❌ Incomplete AWS SSO OIDC credentials"
        echo "   - refresh_token: ${refresh_token:-missing}"
        echo "   - client_id: ${client_id:-missing}"
        echo "   - client_secret: ${client_secret:-missing}"
        return 1
    fi

    # Use SSO region if available, otherwise use default
    local oidc_region="${sso_region:-$region}"
    local oidc_url="https://oidc.${oidc_region}.amazonaws.com/token"

    # echo "🔑 Exchanging refresh token for access token via AWS SSO OIDC..."

    # Exchange refresh token for access token using AWS SSO OIDC
    local response
    response=$(curl -s -X POST "$oidc_url" \
        -H "Content-Type: application/json" \
        -d "{
            \"grantType\": \"refresh_token\",
            \"clientId\": \"$client_id\",
            \"clientSecret\": \"$client_secret\",
            \"refreshToken\": \"$refresh_token\"
        }")

    if [[ $? -ne 0 ]]; then
        echo "❌ Failed to exchange token: Network error"
        return 1
    fi

    # Check for errors in response
    local error_message
    error_message=$(echo "$response" | jq -r '.error // empty')

    if [[ -n "$error_message" ]]; then
        local error_description
        error_description=$(echo "$response" | jq -r '.error_description // "No description"')
        echo "❌ Token exchange failed: $error_message - $error_description"
        return 1
    fi

    # Extract access token
    local access_token
    access_token=$(echo "$response" | jq -r '.accessToken // empty')

    if [[ -z "$access_token" ]]; then
        echo "❌ No access token in response"
        echo "Response: $response"
        return 1
    fi

    # Export the access token for use by the application
    export ANTHROPIC_AUTH_TOKEN="$access_token"
}

# Function to get refresh token (for backwards compatibility)
function get_kiro_refresh_token() {
    local db_path="${HOME}/Library/Application Support/kiro-cli/data.sqlite3"

    # Query for device registration data
    local device_data
    device_data=$(sqlite3 "$db_path" "SELECT value FROM auth_kv WHERE key = 'kirocli:odic:device-registration' OR key = 'codewhisperer:odic:device-registration' LIMIT 1;")

    if [[ -n "$device_data" ]]; then
        local refresh_token
        refresh_token=$(echo "$device_data" | jq -r '.refresh_token // empty')

        if [[ -n "$refresh_token" ]]; then
            export ANTHROPIC_AUTH_TOKEN="$refresh_token"
            echo "✅ Refresh token set successfully!"
            return 0
        fi
    fi

    echo "❌ No refresh token found"
    return 1
}

# Main function - uses access token by default
function get_kiro_token() {
    get_kiro_access_token "$@"
}

# Alias for refresh token (if needed)
function get_kiro_refresh() {
    get_kiro_refresh_token "$@"
}
