@echo off
echo 🚀 Starting users import via API...

echo 📊 Sending users data to API endpoint...

curl -X POST http://localhost:1735/api/users/import ^
  -H "Content-Type: application/json" ^
  -d @api-import-data.json

echo.
echo ✅ Import request completed!
pause
