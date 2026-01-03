@echo off
REM Quick test script for ExportTextsToJSON_UI module
REM This script copies the latest version from the project folder before testing

SET PROJECT_NAME=tkr-lexicon-flex
SET MODULE_NAME=ExportTextsToJSON_UI
SET PROJECT_DIR=%~dp0
SET FLEXTOOLS_DIR=C:\Users\swag_\Documents\FlexTools
SET FLEXTOOLS_MODULES=%FLEXTOOLS_DIR%\scripts\Modules

echo ========================================
echo Testing %MODULE_NAME%
echo Project: %PROJECT_NAME%
echo ========================================
echo.
echo Copying latest module from project folder...
copy /Y "%PROJECT_DIR%%MODULE_NAME%.py" "%FLEXTOOLS_MODULES%\%MODULE_NAME%.py"
if exist "%PROJECT_DIR%text_filter_dialog.py" (
    echo Copying text_filter_dialog.py...
    copy /Y "%PROJECT_DIR%text_filter_dialog.py" "%FLEXTOOLS_MODULES%\text_filter_dialog.py"
)
echo.

cd /d "%FLEXTOOLS_DIR%"
python scripts\TestAModule.py "%FLEXTOOLS_MODULES%\%MODULE_NAME%.py" %PROJECT_NAME%
cd /d "%PROJECT_DIR%"

echo.
echo ========================================
echo Test complete.
echo Log file: %FLEXTOOLS_DIR%\TestAModule.log
echo ========================================
pause
