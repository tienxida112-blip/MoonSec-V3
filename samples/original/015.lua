-- MoonSec V3 sample 015
-- Boyer-Moore-Horspool
local text = "here is a simple example"
local pat = "example"
local n, m = #text, #pat
local skip = {}
for i = 0, 255 do skip[i] = m end
for i = 1, m - 1 do skip[pat:byte(i)] = m - i end
local pos, hits = 1, 0
while pos <= n - m + 1 do
  local j = m
  while j >= 1 and text:sub(pos+j-1, pos+j-1) == pat:sub(j,j) do j = j - 1 end
  if j == 0 then hits = hits + 1; pos = pos + m
  else pos = pos + skip[text:byte(pos+m-1)] end
end
print(hits, pos)

