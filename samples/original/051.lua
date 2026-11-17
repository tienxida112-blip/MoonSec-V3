-- MoonSec V3 sample 051
-- Huffman-ish greedy length assignment
local freq = {a=12,b=7,c=5,d=3,e=2,f=1}
local nodes = {}
for ch, f in pairs(freq) do nodes[#nodes+1] = {f=f, ch=ch} end
while #nodes > 1 do
  table.sort(nodes, function(x,y) return x.f < y.f end)
  local a = table.remove(nodes, 1)
  local b = table.remove(nodes, 1)
  nodes[#nodes+1] = {f = a.f + b.f, l = a, r = b}
end
local bits = {}
local function walk(n, pre)
  if n.ch then bits[n.ch] = pre; return end
  if n.l then walk(n.l, pre.."0") end
  if n.r then walk(n.r, pre.."1") end
end
walk(nodes[1], "")
local total = 0
for ch, f in pairs(freq) do total = total + f * #bits[ch] end
print(total, #bits.a)

