# clean-all.ps1
# This script recursively deletes node_modules, .turbo, dist, and .next folders in the workspace.

$targets = @("node_modules", ".turbo", "dist", ".next")

Write-Host "Starting cleanup of target directories: $($targets -join ', ')..." -ForegroundColor Cyan

foreach ($target in $targets) {
    Write-Host "Searching for '$target' directories..." -ForegroundColor Yellow
    # Get all matching directories, including hidden ones
    $dirs = Get-ChildItem -Path . -Filter $target -Recurse -Directory -Force -ErrorAction SilentlyContinue
    
    if ($dirs) {
        foreach ($dir in $dirs) {
            $path = $dir.FullName
            Write-Host "Deleting: $path" -ForegroundColor Gray
            try {
                # Force delete the directory and all its contents
                Remove-Item -Path $path -Recurse -Force -ErrorAction Stop
            } catch {
                Write-Warning "Could not delete $path. It may be in use by another process. Error: $_"
            }
        }
    } else {
        Write-Host "No '$target' directories found." -ForegroundColor DarkGray
    }
}

Write-Host "Cleanup completed!" -ForegroundColor Green
