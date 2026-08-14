!ifndef BUILD_UNINSTALLER
!include FileFunc.nsh
!include nsDialogs.nsh

Var launchAtLoginCheckbox
Var launchAtLoginWanted

!macro customInit
  StrCpy $launchAtLoginWanted ${BST_UNCHECKED}

  ${GetParameters} $R0

  ClearErrors
  ${GetOptions} $R0 "/launchAtLogin" $R1
  ${IfNot} ${Errors}
    StrCpy $launchAtLoginWanted ${BST_CHECKED}
  ${EndIf}

  ClearErrors
  ${GetOptions} $R0 "--launch-at-login" $R1
  ${IfNot} ${Errors}
    StrCpy $launchAtLoginWanted ${BST_CHECKED}
  ${EndIf}
!macroend

!macro customPageAfterChangeDir
  Page custom aiqdStartupPageCreate aiqdStartupPageLeave
!macroend

Function aiqdStartupPageCreate
  ${If} ${Silent}
    Abort
  ${EndIf}

  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "--updated" $R1
  ${IfNot} ${Errors}
    Abort
  ${EndIf}

  nsDialogs::Create 1018
  Pop $0

  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 18u "Startup"
  Pop $0
  ${NSD_CreateLabel} 0 20u 100% 28u "AIQD can start in the tray when you sign in. This is optional and can be changed later in Settings."
  Pop $0
  ${NSD_CreateCheckbox} 0 58u 100% 14u "Start AIQD when I sign in"
  Pop $launchAtLoginCheckbox

  ${If} $launchAtLoginWanted == ${BST_CHECKED}
    ${NSD_Check} $launchAtLoginCheckbox
  ${Else}
    ${NSD_Uncheck} $launchAtLoginCheckbox
  ${EndIf}

  nsDialogs::Show
FunctionEnd

Function aiqdStartupPageLeave
  ${NSD_GetState} $launchAtLoginCheckbox $launchAtLoginWanted
FunctionEnd

!macro customInstall
  ${If} $launchAtLoginWanted == ${BST_CHECKED}
    DetailPrint "Enabling AIQD launch at startup"
    ${StdUtils.ExecShellAsUser} $0 "$appExe" "open" "--set-launch-at-login=1"
  ${EndIf}
!macroend
!endif

!macro customUnInstall
  RMDir /r "$APPDATA\AI Agent Quota"

  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "AI Agent Quota Dashboard"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.isToniLiu.ai-agent-quota-dashboard"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.istoniliu.ai-agent-quota-dashboard"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "AI Agent Quota Dashboard"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "com.isToniLiu.ai-agent-quota-dashboard"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "com.istoniliu.ai-agent-quota-dashboard"

  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "AI Agent Quota Dashboard"
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "com.isToniLiu.ai-agent-quota-dashboard"
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "com.istoniliu.ai-agent-quota-dashboard"
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "AI Agent Quota Dashboard"
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "com.isToniLiu.ai-agent-quota-dashboard"
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "com.istoniliu.ai-agent-quota-dashboard"
!macroend
