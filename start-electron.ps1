$env:ELECTRON_RUN_AS_NODE = ''
$env:NODE_ENV = 'development'
Set-Location 'c:\Users\user\keuangan-app'
& 'node_modules\electron\dist\electron.exe' '.'
