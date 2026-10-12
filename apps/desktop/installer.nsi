Unicode true
!include "MUI2.nsh"
!include "FileFunc.nsh"

; General Info
Name "OpenAgents"
OutFile "release\OpenAgents-Setup-1.0.0.exe"
InstallDir "$PROGRAMFILES64\OpenAgents"
InstallDirRegKey HKLM "Software\OpenAgents" "InstallDir"
RequestExecutionLevel admin
SetCompressor /SOLID lzma

; Interface Configuration
!define MUI_ABORTWARNING
!define MUI_ICON "resources\icon.ico"
!define MUI_UNICON "resources\icon.ico"

; Installer Pages
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES

!define MUI_FINISHPAGE_RUN "$INSTDIR\OpenAgents.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Launch OpenAgents now"
!insertmacro MUI_PAGE_FINISH

; Uninstaller Pages
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

; Languages
!insertmacro MUI_LANGUAGE "English"

; Installer Section
Section "Install"
  SetRegView 64
  DetailPrint "Stopping existing OpenAgents instances..."
  nsExec::Exec 'taskkill /f /im OpenAgents.exe'
  Sleep 1000

  CreateDirectory "$INSTDIR"
  SetOutPath "$INSTDIR"
  
  ; Install all unpacked files
  File /r "release\win-unpacked\*.*"

  ; Write uninstaller
  WriteUninstaller "$INSTDIR\Uninstall OpenAgents.exe"

  ; Registry settings
  WriteRegStr HKLM "Software\OpenAgents" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "OpenAgents" '"$INSTDIR\OpenAgents.exe"'

  ; Add/Remove Programs integration
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\OpenAgents" "DisplayName" "OpenAgents"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\OpenAgents" "DisplayVersion" "1.0.0"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\OpenAgents" "Publisher" "OpenAgents Inc."
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\OpenAgents" "DisplayIcon" "$INSTDIR\resources\icon.ico"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\OpenAgents" "UninstallString" '"$INSTDIR\Uninstall OpenAgents.exe"'
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\OpenAgents" "NoModify" 1
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\OpenAgents" "NoRepair" 1

  ; Start Menu Shortcuts
  CreateDirectory "$SMPROGRAMS\OpenAgents"
  CreateShortcut "$SMPROGRAMS\OpenAgents\OpenAgents.lnk" "$INSTDIR\OpenAgents.exe" "" "$INSTDIR\resources\icon.ico" 0
  CreateShortcut "$SMPROGRAMS\OpenAgents\Uninstall OpenAgents.lnk" "$INSTDIR\Uninstall OpenAgents.exe" "" "" 0

  ; Desktop Shortcut
  CreateShortcut "$DESKTOP\OpenAgents.lnk" "$INSTDIR\OpenAgents.exe" "" "$INSTDIR\resources\icon.ico" 0
SectionEnd

; Uninstaller Section
Section "Uninstall"
  SetRegView 64
  DetailPrint "Stopping OpenAgents..."
  nsExec::Exec 'taskkill /f /im OpenAgents.exe'
  Sleep 1000

  ; Delete shortcuts
  Delete "$DESKTOP\OpenAgents.lnk"
  Delete "$SMPROGRAMS\OpenAgents\OpenAgents.lnk"
  Delete "$SMPROGRAMS\OpenAgents\Uninstall OpenAgents.lnk"
  RMDir "$SMPROGRAMS\OpenAgents"

  ; Delete registry keys
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "OpenAgents"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\OpenAgents"
  DeleteRegKey HKLM "Software\OpenAgents"

  ; Delete installation directory
  RMDir /r "$INSTDIR"
SectionEnd
