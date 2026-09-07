const { spawn } = require('child_process');
const psScript = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class Mouse {
    [DllImport("user32.dll")]
    public static extern void mouse_event(int dwFlags, int dx, int dy, int cButtons, int dwExtraInfo);
}
"@
[Mouse]::mouse_event(2, 0, 0, 0, 0)
[Mouse]::mouse_event(4, 0, 0, 0, 0)
`;
const ps = spawn('powershell.exe', ['-NoProfile', '-Command', psScript]);
ps.stderr.on('data', d => console.error(d.toString()));
ps.stdout.on('data', d => console.log(d.toString()));
ps.on('close', code => console.log('Exited with', code));
