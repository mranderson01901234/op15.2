; Inno Setup script for OP15 Agent Windows Installer
; This creates a true Windows installer (.exe) that users can double-click

[Setup]
AppId={{A1B2C3D4-E5F6-4A5B-8C9D-0E1F2A3B4C5D}
AppName=OP15 Agent
AppVersion=1.0.0
AppPublisher=OP15
AppPublisherURL=https://op15.com
DefaultDirName={localappdata}\OP15\Agent
DefaultGroupName=OP15
DisableProgramGroupPage=yes
DisableWelcomePage=no
OutputDir=..\installers
OutputBaseFilename=OP15-Agent-Setup
SetupIconFile=
Compression=lzma2
SolidCompression=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
UninstallDisplayIcon={app}\op15-agent.exe
UninstallDisplayName=OP15 Agent

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
; Copy agent binary
Source: "..\local-agent\dist\binaries\local-agent-win-x64.exe"; DestDir: "{app}"; DestName: "op15-agent.exe"; Flags: ignoreversion
; Config will be created by installer script

[Run]
; Start agent after installation
Filename: "{app}\op15-agent.exe"; Parameters: "--install"; Description: "Start OP15 Agent"; Flags: nowait postinstall skipifsilent

[UninstallRun]
; Stop agent before uninstall
Filename: "{app}\op15-agent.exe"; Parameters: "--uninstall"; RunOnceId: "StopAgent"

[Code]
var
  UserIdPage: TInputQueryWizardPage;
  ServerUrlPage: TInputQueryWizardPage;

procedure InitializeWizard;
begin
  // Create custom pages for credentials (if needed)
  // For now, credentials are injected during build
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ConfigFile: String;
  ConfigContent: String;
  UserId: String;
  Secret: String;
  ServerUrl: String;
begin
  if CurStep = ssPostInstall then
  begin
    // Read credentials from installer defines (injected during build)
    UserId := ExpandConstant('{#UserId}');
    Secret := ExpandConstant('{#Secret}');
    ServerUrl := ExpandConstant('{#ServerUrl}');
    
    // Write config.json
    ConfigFile := ExpandConstant('{app}\config.json');
    ConfigContent := 
      '{' + #13#10 +
      '  "userId": "' + UserId + '",' + #13#10 +
      '  "sharedSecret": "' + Secret + '",' + #13#10 +
      '  "serverUrl": "' + ServerUrl + '",' + #13#10 +
      '  "httpPort": 4001' + #13#10 +
      '}';
    
    SaveStringToFile(ConfigFile, ConfigContent, False);
  end;
end;

function InitializeUninstall(): Boolean;
begin
  Result := True;
end;

