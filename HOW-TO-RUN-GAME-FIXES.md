# How to Fix Incorrectly Scored Games

## ✅ **EASY BROWSER METHOD (RECOMMENDED)**

1. **Go to your Admin Dashboard** in your web browser
2. **Open Developer Console** (F12 or Right-click → Inspect → Console)
3. **Run this command:**
   ```javascript
   fixIncorrectGames()
   ```

That's it! The function will:
- ✅ Find Louisville-James Madison, OU-Michigan, Army-Kansas State, and any other incorrectly scored games
- ✅ Show you exactly what will be fixed before doing anything
- ✅ Ask for confirmation before making changes
- ✅ Update all affected picks with correct points

## Alternative: Command Line Method

If you prefer terminal/command line, navigate to your project folder:
```bash
cd /Users/kurtiswh/Cursor/PP6
```

Then run:
```bash
node fix-games-simple.cjs
```

## What the Fix Does:

1. **Identifies all games with incorrect scoring** using the new unified push logic
2. **Shows exactly what will be changed** before making updates
3. **Updates the game winner and margin bonus** to correct values  
4. **Recalculates all affected picks** with correct points
5. **Updates both regular and anonymous picks**
6. **Prevents future overwrites** by ensuring all services use consistent logic

## Expected Output:

The script will show:
- ✅ Games already correctly scored
- 🔧 Games being fixed with before/after values
- 📊 Total picks updated
- ⚠️ Any errors or issues

## After Running:

- **Manual corrections will no longer be reverted**
- **All services use the same push calculation logic**
- **Louisville-James Madison, OU-Michigan, Army-Kansas State will be correctly scored**
- **Points will be properly awarded for push games (10 points each)**

## Troubleshooting:

If you get permission errors, make sure you're in the correct directory:
```bash
pwd
# Should show: /Users/kurtiswh/Cursor/PP6
```

If you get "command not found" errors, make sure Node.js is installed:
```bash
node --version
# Should show version number
```