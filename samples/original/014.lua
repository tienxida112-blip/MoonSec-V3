-- MoonSec V3 sample 014
-- Knuth-Morris-Pratt
local s = "ababcabababcababdababcabab"
local p = "ababd"
local n, m = #s, #p
local lps = {0}
local len, i = 0, 2
while i <= m do
  if p:sub(i,i) == p:sub(len+1,len+1) then len = len + 1; lps[i] = len; i = i + 1
  elseif len > 0 then len = lps[len]
  else lps[i] = 0; i = i + 1 end
end
local found, j = {}, 1
i = 1
while i <= n do
  if s:sub(i,i) == p:sub(j,j) then i = i + 1; j = j + 1
    if j > m then found[#found+1] = i - m; j = lps[m] or 0 end
  elseif j > 1 then j = lps[j-1] + 1
  else i = i + 1 end
end
print(#found, found[1] or -1)

