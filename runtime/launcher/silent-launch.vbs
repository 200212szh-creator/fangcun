Option Explicit

Dim shell, command, index
Set shell = CreateObject("WScript.Shell")

If WScript.Arguments.Count < 2 Then WScript.Quit 2

command = Quote(WScript.Arguments(0)) & " " & Quote(WScript.Arguments(1))
For index = 2 To WScript.Arguments.Count - 1
  command = command & " " & Quote(WScript.Arguments(index))
Next

shell.Run command, 0, False

Function Quote(value)
  Quote = Chr(34) & Replace(value, Chr(34), Chr(34) & Chr(34)) & Chr(34)
End Function
