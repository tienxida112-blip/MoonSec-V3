-- MoonSec V3 sample 088
-- JSON-lite number/array parser
local s, i = "[12,-3,40,5]", 1
local function skip() while s:sub(i,i):match("%s") do i = i + 1 end end
local function parse()
  skip()
  local c = s:sub(i,i)
  if c == "[" then
    i = i + 1; local t = {}
    skip()
    if s:sub(i,i) == "]" then i = i + 1; return t end
    while true do
      t[#t+1] = parse(); skip()
      if s:sub(i,i) == "," then i = i + 1
      elseif s:sub(i,i) == "]" then i = i + 1; break
      else break end
    end
    return t
  else
    local j = i
    if s:sub(i,i) == "-" then i = i + 1 end
    while s:sub(i,i):match("%d") do i = i + 1 end
    return tonumber(s:sub(j, i-1))
  end
end
local t = parse()
local s2 = 0
for k = 1, #t do s2 = s2 + t[k] * k end
print(s2, #t)

