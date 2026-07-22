function Update-XjkWinInetSettings {
  if (-not ("XjkWinInetNative" -as [type])) {
    Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class XjkWinInetNative {
  [DllImport("wininet.dll", SetLastError=true)]
  public static extern bool InternetSetOption(IntPtr hInternet, int dwOption, IntPtr lpBuffer, int dwBufferLength);
}
"@
  }

  [void][XjkWinInetNative]::InternetSetOption([IntPtr]::Zero, 39, [IntPtr]::Zero, 0)
  [void][XjkWinInetNative]::InternetSetOption([IntPtr]::Zero, 37, [IntPtr]::Zero, 0)
}
