-- MoonSec V3 sample 065
-- UTF-8 validator + codepoint count
local function utf8count(bytes)
  local i, n, ok = 1, 0, 1
  while i <= #bytes do
    local b = bytes[i]
    local need = 1
    if b < 128 then need = 1
    elseif b >= 192 and b < 224 then need = 2
    elseif b >= 224 and b < 240 then need = 3
    elseif b >= 240 and b < 248 then need = 4
    else ok = 0; break end
    if i + need - 1 > #bytes then ok = 0; break end
    for k = 1, need-1 do
      local c = bytes[i+k]
      if c < 128 or c >= 192 then ok = 0; break end
    end
    if ok == 0 then break end
    i = i + need; n = n + 1
  end
  return n, ok
end
local s = {72,101,108,108,111,32,226,156,147,32,240,159,152,128}
local n, ok = utf8count(s)
print(n, ok)

