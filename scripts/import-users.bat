@echo off
echo 🚀 Starting MongoDB import process...

echo 📊 Importing users from JSON file...

mongoimport --uri "mongodb+srv://dev2brtmultisoftware_db_user:BjCAEjKs4Gbily2b@cluster0.7gyf9kj.mongodb.net/bdc?retryWrites=true&w=majority&appName=Cluster0" --collection users --file "bdc_mlm.users.json" --jsonArray --drop

echo ✅ Import completed!
pause
