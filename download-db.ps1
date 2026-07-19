$VpsUser = "root" # Replace with your VPS username
$VpsHost = "153.75.226.221" # Replace with your VPS IP or domain name

# Update this path to where the database is stored on your VPS. 
# If running via Docker, you might need to copy it out of the container first, 
# or access the docker volume directly on the host (e.g., /var/lib/docker/volumes/...)
# If running directly, it's inside the App_Data folder:
$RemotePath = "/var/www/electricity-api/App_Data/electricity-payments-v2.db"
$LocalPath = ".\electricity-payments-v2.db"

Write-Host "Downloading SQLite database from $VpsUser@$VpsHost..."

# Using scp to download the file. Make sure you have SSH access to the VPS.
scp "$VpsUser@$VpsHost`:$RemotePath" $LocalPath

if ($?) {
    Write-Host "Database successfully downloaded to $LocalPath" -ForegroundColor Green
} else {
    Write-Host "Failed to download database. Check the path and your SSH credentials." -ForegroundColor Red
}
# 