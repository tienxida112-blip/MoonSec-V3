-- MoonSec V3 sample 010
-- Binary heap sort
local h = {0}
local function push(x)
  h[#h+1] = x
  local i = #h
  while i > 2 do
    local p = math.floor(i/2)
    if h[p] <= h[i] then break end
    h[p], h[i] = h[i], h[p]; i = p
  end
end
local function pop()
  local r, v, i = h[2], h[#h], 2
  h[2] = v; h[#h] = nil
  while true do
    local l, rgt, m = i*2, i*2+1, i
    if l <= #h and h[l] < h[m] then m = l end
    if rgt <= #h and h[rgt] < h[m] then m = rgt end
    if m == i then break end
    h[i], h[m] = h[m], h[i]; i = m
  end
  return r
end
for _, x in ipairs({9,4,7,1,8,2,6,3,5,0}) do push(x) end
local o = {}
while #h > 1 do o[#o+1] = pop() end
print(table.concat(o, ","))

