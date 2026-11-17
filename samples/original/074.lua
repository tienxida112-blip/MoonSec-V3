-- MoonSec V3 sample 074
-- LRU cache simulation
local cap = 4
local map, head, time = {}, {}, 0
local function get(k)
  if not map[k] then return nil end
  time = time + 1; map[k].t = time
  return map[k].v
end
local function put(k, v)
  time = time + 1
  if map[k] then map[k].v = v; map[k].t = time; return end
  local n = 0; for _ in pairs(map) do n = n + 1 end
  if n >= cap then
    local oldk, oldt = nil, 1e18
    for kk, e in pairs(map) do if e.t < oldt then oldt = e.t; oldk = kk end end
    map[oldk] = nil
  end
  map[k] = {v=v, t=time}
end
put("a",1); put("b",2); put("c",3); put("d",4)
get("a"); put("e",5)
local s = 0
for k, e in pairs(map) do s = s + e.v + k:byte() end
print(s, map.b and 1 or 0, map.e and 1 or 0)

