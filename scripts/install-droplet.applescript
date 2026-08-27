-- 拖放安装器：把 ImageGenerate.app 拖到本程序图标上即完成
-- 1) ditto 拷贝到 /Applications  2) 清除 quarantine  3) ad-hoc 自签
on open droppedItems
	set appName to "ImageGenerate"
	set destPath to "/Applications/" & appName & ".app"

	if (count of droppedItems) is 0 then return
	set srcPath to POSIX path of (item 1 of droppedItems)

	if srcPath does not end with ".app" then
		display dialog "请把 " & appName & ".app 拖到这个图标上" buttons {"知道了"} with icon stop
		return
	end if

	set shellCmd to "rm -rf " & quoted form of destPath & " && ditto " & quoted form of srcPath & " " & quoted form of destPath & " && xattr -dr com.apple.quarantine " & quoted form of destPath & " ; codesign --force --deep --sign - " & quoted form of destPath

	try
		do shell script shellCmd with administrator privileges
	on error errMsg
		display dialog "安装失败：" & errMsg buttons {"知道了"} with icon stop
		return
	end try

	display dialog "已安装到「应用程序」文件夹，直接打开即可。" buttons {"好"} with icon note
	tell application "Finder" to reveal (POSIX file destPath)
end open
