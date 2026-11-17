'use strict';

// 93 structurally distinct benches. Each kernel uses different control
// flow / data structures — not a parameterized copy of a family template.

function benches() {
  return [
`-- Insertion sort + inversion count
local a = {9,1,8,2,7,3,6,4,5,0,11,10,14,13,12}
local inv, n = 0, #a
for i = 2, n do
  local key, j = a[i], i - 1
  while j >= 1 and a[j] > key do
    a[j+1] = a[j]; inv = inv + 1; j = j - 1
  end
  a[j+1] = key
end
local s = 0
for i = 1, n do s = s + a[i] * i end
print(s, inv)
`,
`-- In-place quicksort (Lomuto) then median
local a = {23,1,44,8,15,16,4,42,9,0,7,18,3,21,11,5,30,2,19,6}
local function qs(lo, hi)
  if lo >= hi then return end
  local p, i = a[hi], lo
  for j = lo, hi - 1 do
    if a[j] <= p then a[i], a[j] = a[j], a[i]; i = i + 1 end
  end
  a[i], a[hi] = a[hi], a[i]
  qs(lo, i - 1); qs(i + 1, hi)
end
qs(1, #a)
print(a[1], a[#a], a[math.floor((#a+1)/2)])
`,
`-- Binary heap sort
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
`,
`-- Bottom-up merge sort
local a = {5,2,9,1,7,3,8,4,6,0,11,10}
local function merge(src, dst, lo, mid, hi)
  local i, j = lo, mid
  for k = lo, hi - 1 do
    if i < mid and (j >= hi or src[i] <= src[j]) then dst[k] = src[i]; i = i + 1
    else dst[k] = src[j]; j = j + 1 end
  end
end
local n, src, dst = #a, a, {}
local width = 1
while width < n do
  for i = 1, n, width * 2 do
    local lo, mid, hi = i, math.min(i+width, n+1), math.min(i+width*2, n+1)
    merge(src, dst, lo, mid, hi)
  end
  src, dst, width = dst, src, width * 2
end
local s = 0
for i = 1, n do s = s + src[i] * (i+3) end
print(s)
`,
`-- LSD radix sort base 10
local a = {329,457,657,839,436,720,355,0,12,99,1000,5}
local maxv = 0
for i = 1, #a do if a[i] > maxv then maxv = a[i] end end
local exp = 1
while math.floor(maxv / exp) > 0 do
  local bkt = {}
  for d = 0, 9 do bkt[d] = {} end
  for i = 1, #a do
    local d = math.floor(a[i] / exp) % 10
    bkt[d][#bkt[d]+1] = a[i]
  end
  local k = 1
  for d = 0, 9 do
    for i = 1, #bkt[d] do a[k] = bkt[d][i]; k = k + 1 end
  end
  exp = exp * 10
end
print(a[1], a[#a], a[6])
`,
`-- Binary search over a generated table
local a = {}
for i = 1, 64 do a[i] = i * i - 7 end
local function bsearch(x)
  local lo, hi = 1, #a
  while lo <= hi do
    local m = math.floor((lo+hi)/2)
    if a[m] == x then return m
    elseif a[m] < x then lo = m + 1
    else hi = m - 1 end
  end
  return -1
end
local hits = 0
for x = 0, 200, 13 do
  if bsearch(x) > 0 then hits = hits + 1 end
end
print(hits, bsearch(a[20]))
`,
`-- Knuth-Morris-Pratt
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
`,
`-- Boyer-Moore-Horspool
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
`,
`-- Rabin-Karp rolling hash
local s, p = "cabcabacabacabacab", "acab"
local base, mod = 256, 1000003
local n, m = #s, #p
local ph, sh, pow = 0, 0, 1
for i = 1, m do
  ph = (ph * base + p:byte(i)) % mod
  sh = (sh * base + s:byte(i)) % mod
  if i < m then pow = (pow * base) % mod end
end
local hits = 0
for i = 1, n - m + 1 do
  if ph == sh then
    local ok = true
    for k = 1, m do if s:byte(i+k-1) ~= p:byte(k) then ok = false break end end
    if ok then hits = hits + 1 end
  end
  if i <= n - m then
    sh = (sh - s:byte(i) * pow) % mod
    if sh < 0 then sh = sh + mod end
    sh = (sh * base + s:byte(i+m)) % mod
  end
end
print(hits)
`,
`-- Longest common subsequence
local a, b = "AGGTABXYZ", "GXTXAYBZZ"
local n, m = #a, #b
local dp = {}
for i = 0, n do dp[i] = {}; for j = 0, m do dp[i][j] = 0 end end
for i = 1, n do
  for j = 1, m do
    if a:sub(i,i) == b:sub(j,j) then dp[i][j] = dp[i-1][j-1] + 1
    else dp[i][j] = math.max(dp[i-1][j], dp[i][j-1]) end
  end
end
print(dp[n][m])
`,
`-- Patience LIS length
local a = {3,1,4,1,5,9,2,6,5,3,5,8,9,7,9}
local piles = {}
for i = 1, #a do
  local x, lo, hi = a[i], 1, #piles
  while lo <= hi do
    local mid = math.floor((lo+hi)/2)
    if piles[mid] < x then lo = mid + 1 else hi = mid - 1 end
  end
  piles[lo] = x
end
print(#piles, piles[#piles])
`,
`-- 0/1 knapsack
local w = {2,3,4,5,9,1,6}
local v = {3,4,8,8,10,1,7}
local W = 12
local dp = {}
for i = 0, W do dp[i] = 0 end
for i = 1, #w do
  for cap = W, w[i], -1 do
    local t = dp[cap-w[i]] + v[i]
    if t > dp[cap] then dp[cap] = t end
  end
end
print(dp[W])
`,
`-- Coin change combinations
local coins = {1,5,10,25}
local N = 40
local dp = {}
for i = 0, N do dp[i] = 0 end
dp[0] = 1
for _, c in ipairs(coins) do
  for x = c, N do dp[x] = dp[x] + dp[x-c] end
end
print(dp[N])
`,
`-- Floyd-Warshall on 6 nodes
local inf = 1e9
local n = 6
local d = {}
for i = 1, n do
  d[i] = {}
  for j = 1, n do d[i][j] = (i==j) and 0 or inf end
end
local edges = {{1,2,7},{1,3,9},{1,6,14},{2,3,10},{2,4,15},{3,4,11},{3,6,2},{4,5,6},{5,6,9}}
for _, e in ipairs(edges) do
  d[e[1]][e[2]] = e[3]; d[e[2]][e[1]] = e[3]
end
for k = 1, n do
  for i = 1, n do
    for j = 1, n do
      local t = d[i][k] + d[k][j]
      if t < d[i][j] then d[i][j] = t end
    end
  end
end
local s = 0
for i = 1, n do for j = i+1, n do s = s + d[i][j] end end
print(s)
`,
`-- Dijkstra from node 1
local n = 8
local adj = {}
for i = 1, n do adj[i] = {} end
local function add(u,v,w) adj[u][#adj[u]+1] = {v,w}; adj[v][#adj[v]+1] = {u,w} end
add(1,2,4); add(1,3,2); add(2,3,1); add(2,4,5); add(3,4,8); add(3,5,10)
add(4,5,2); add(4,6,6); add(5,6,3); add(5,7,7); add(6,8,4); add(7,8,1)
local dist, used = {}, {}
for i = 1, n do dist[i] = 1e9; used[i] = false end
dist[1] = 0
for _ = 1, n do
  local u, best = -1, 1e9
  for i = 1, n do if not used[i] and dist[i] < best then best = dist[i]; u = i end end
  if u < 0 then break end
  used[u] = true
  for _, e in ipairs(adj[u]) do
    local v, w = e[1], e[2]
    if dist[u] + w < dist[v] then dist[v] = dist[u] + w end
  end
end
local s = 0
for i = 1, n do s = s + dist[i] end
print(s)
`,
`-- Kruskal MST
local edges = {{1,2,4},{1,3,3},{2,3,1},{2,4,2},{3,4,4},{3,5,6},{4,5,5},{4,6,7},{5,6,3}}
table.sort(edges, function(a,b) return a[3] < b[3] end)
local p = {}
for i = 1, 6 do p[i] = i end
local function find(x) while p[x] ~= x do p[x] = p[p[x]]; x = p[x] end; return x end
local cost, used = 0, 0
for _, e in ipairs(edges) do
  local a, b = find(e[1]), find(e[2])
  if a ~= b then p[a] = b; cost = cost + e[3]; used = used + 1 end
end
print(cost, used)
`,
`-- Kahn topological sort
local n = 7
local indeg, adj = {}, {}
for i = 1, n do indeg[i] = 0; adj[i] = {} end
local function edge(u,v) adj[u][#adj[u]+1] = v; indeg[v] = indeg[v] + 1 end
edge(1,3); edge(1,4); edge(2,4); edge(2,5); edge(3,6); edge(4,6); edge(4,7); edge(5,7)
local q, qh, qt, order = {}, 1, 0, {}
for i = 1, n do if indeg[i] == 0 then qt = qt + 1; q[qt] = i end end
while qh <= qt do
  local u = q[qh]; qh = qh + 1; order[#order+1] = u
  for _, v in ipairs(adj[u]) do
    indeg[v] = indeg[v] - 1
    if indeg[v] == 0 then qt = qt + 1; q[qt] = v end
  end
end
print(table.concat(order, "-"))
`,
`-- BFS bipartite check + distances
local n = 9
local adj = {}
for i = 1, n do adj[i] = {} end
local function e(u,v) adj[u][#adj[u]+1]=v; adj[v][#adj[v]+1]=u end
e(1,2); e(1,3); e(2,4); e(3,5); e(4,6); e(5,6); e(6,7); e(7,8); e(8,9)
local col, dist = {}, {}
for i = 1, n do col[i] = 0; dist[i] = -1 end
local q = {1}; dist[1] = 0; col[1] = 1
local qi, bip = 1, 1
while qi <= #q do
  local u = q[qi]; qi = qi + 1
  for _, v in ipairs(adj[u]) do
    if col[v] == 0 then
      col[v] = 3 - col[u]; dist[v] = dist[u] + 1; q[#q+1] = v
    elseif col[v] == col[u] then bip = 0 end
  end
end
local s = 0
for i = 1, n do s = s + (dist[i] or 0) * col[i] end
print(bip, s)
`,
`-- Tarjan SCC count
local n = 8
local adj = {}
for i = 1, n do adj[i] = {} end
local function e(u,v) adj[u][#adj[u]+1] = v end
e(1,2); e(2,3); e(3,1); e(3,4); e(4,5); e(5,4); e(5,6); e(6,7); e(7,6); e(7,8)
local idx, low, on, st, time, scc = {}, {}, {}, {}, 0, 0
for i = 1, n do idx[i] = -1; low[i] = 0; on[i] = false end
local function dfs(u)
  time = time + 1; idx[u] = time; low[u] = time
  st[#st+1] = u; on[u] = true
  for _, v in ipairs(adj[u]) do
    if idx[v] < 0 then dfs(v); low[u] = math.min(low[u], low[v])
    elseif on[v] then low[u] = math.min(low[u], idx[v]) end
  end
  if low[u] == idx[u] then
    scc = scc + 1
    while true do
      local x = st[#st]; st[#st] = nil; on[x] = false
      if x == u then break end
    end
  end
end
for i = 1, n do if idx[i] < 0 then dfs(i) end end
print(scc)
`,
`-- Union-find max component with path compression
local n = 20
local p, sz = {}, {}
for i = 1, n do p[i] = i; sz[i] = 1 end
local function find(x)
  local r = x
  while p[r] ~= r do r = p[r] end
  while p[x] ~= x do local n2 = p[x]; p[x] = r; x = n2 end
  return r
end
local function unite(a,b)
  a, b = find(a), find(b)
  if a == b then return end
  if sz[a] < sz[b] then a, b = b, a end
  p[b] = a; sz[a] = sz[a] + sz[b]
end
local pairs = {{1,2},{2,3},{4,5},{5,6},{6,7},{1,8},{9,10},{11,12},{12,13},{8,4},{14,15}}
for _, q in ipairs(pairs) do unite(q[1], q[2]) end
local mx = 0
for i = 1, n do if sz[find(i)] > mx then mx = sz[find(i)] end end
print(mx)
`,
`-- Recursive-descent arithmetic evaluator
local s, pos = "2*(3+4*5)-6/(1+1)", 1
local function peek() return s:sub(pos,pos) end
local function eat() local c = peek(); pos = pos + 1; return c end
local expr
local function num()
  local v = 0
  while peek():match("%d") do v = v * 10 + tonumber(eat()) end
  return v
end
local function factor()
  if peek() == "(" then eat(); local v = expr(); eat(); return v end
  return num()
end
local function term()
  local v = factor()
  while peek() == "*" or peek() == "/" do
    local op = eat()
    local r = factor()
    if op == "*" then v = v * r else v = v / r end
  end
  return v
end
expr = function()
  local v = term()
  while peek() == "+" or peek() == "-" do
    local op = eat()
    local r = term()
    if op == "+" then v = v + r else v = v - r end
  end
  return v
end
print(expr())
`,
`-- Shunting-yard to RPN then eval
local tokens = {"3","+","4","*","2","/","(","1","-","5",")","^","2"}
local prec = {["+"]=1,["-"]=1,["*"]=2,["/"]=2,["^"]=3}
local right = {["^"]=true}
local out, ops = {}, {}
for _, t in ipairs(tokens) do
  if tonumber(t) then out[#out+1] = t
  elseif t == "(" then ops[#ops+1] = t
  elseif t == ")" then
    while ops[#ops] ~= "(" do out[#out+1] = ops[#ops]; ops[#ops] = nil end
    ops[#ops] = nil
  else
    while #ops > 0 and ops[#ops] ~= "(" and
      (prec[ops[#ops]] > prec[t] or (prec[ops[#ops]] == prec[t] and not right[t])) do
      out[#out+1] = ops[#ops]; ops[#ops] = nil
    end
    ops[#ops+1] = t
  end
end
while #ops > 0 do out[#out+1] = ops[#ops]; ops[#ops] = nil end
local st = {}
for _, t in ipairs(out) do
  if tonumber(t) then st[#st+1] = tonumber(t)
  else
    local b, a = st[#st], st[#st-1]; st[#st] = nil; st[#st] = nil
    if t == "+" then st[#st+1] = a+b
    elseif t == "-" then st[#st+1] = a-b
    elseif t == "*" then st[#st+1] = a*b
    elseif t == "/" then st[#st+1] = a/b
    else st[#st+1] = a^b end
  end
end
print(math.floor(st[1] * 1000 + 0.5))
`,
`-- S-expression evaluator
local function parse(s)
  local i = 1
  local function skip() while s:sub(i,i):match("%s") do i = i + 1 end end
  local function read()
    skip()
    if s:sub(i,i) == "(" then
      i = i + 1; local t = {}
      skip()
      while s:sub(i,i) ~= ")" and i <= #s do t[#t+1] = read(); skip() end
      i = i + 1; return t
    else
      local j = i
      while i <= #s and not s:sub(i,i):match("[%s%(%)]") do i = i + 1 end
      local w = s:sub(j, i-1)
      return tonumber(w) or w
    end
  end
  return read()
end
local function ev(x)
  if type(x) ~= "table" then return x end
  local op = x[1]
  if op == "+" then return ev(x[2]) + ev(x[3])
  elseif op == "*" then return ev(x[2]) * ev(x[3])
  elseif op == "-" then return ev(x[2]) - ev(x[3])
  elseif op == "if" then if ev(x[2]) ~= 0 then return ev(x[3]) else return ev(x[4]) end
  else return 0 end
end
print(ev(parse("(* (+ 2 3) (if 1 7 9))")))
`,
`-- Tiny stack VM (postfix)
local code = { "push", 6, "push", 7, "mul", "push", 5, "add", "dup", "push", 2, "div", "sub" }
local st, pc = {}, 1
while pc <= #code do
  local op = code[pc]; pc = pc + 1
  if op == "push" then st[#st+1] = code[pc]; pc = pc + 1
  elseif op == "add" then local b=st[#st]; st[#st]=nil; st[#st]=st[#st]+b
  elseif op == "sub" then local b=st[#st]; st[#st]=nil; st[#st]=st[#st]-b
  elseif op == "mul" then local b=st[#st]; st[#st]=nil; st[#st]=st[#st]*b
  elseif op == "div" then local b=st[#st]; st[#st]=nil; st[#st]=math.floor(st[#st]/b)
  elseif op == "dup" then st[#st+1] = st[#st]
  end
end
print(st[1])
`,
`-- Brainfuck-lite interpreter
local src = "++[>++[>+++<-]<-]>>."
local tape, ptr, pc, out = {}, 1, 1, 0
for i = 1, 32 do tape[i] = 0 end
local match, st = {}, {}
for i = 1, #src do
  local c = src:sub(i,i)
  if c == "[" then st[#st+1] = i
  elseif c == "]" then local j = st[#st]; st[#st]=nil; match[i]=j; match[j]=i end
end
while pc <= #src do
  local c = src:sub(pc,pc)
  if c == ">" then ptr = ptr + 1
  elseif c == "<" then ptr = ptr - 1
  elseif c == "+" then tape[ptr] = (tape[ptr] + 1) % 256
  elseif c == "-" then tape[ptr] = (tape[ptr] - 1) % 256
  elseif c == "." then out = out + tape[ptr]
  elseif c == "[" then if tape[ptr] == 0 then pc = match[pc] end
  elseif c == "]" then if tape[ptr] ~= 0 then pc = match[pc] end
  end
  pc = pc + 1
end
print(out, tape[ptr])
`,
`-- Extended Euclidean + modular inverse
local function egcd(a, b)
  if b == 0 then return a, 1, 0 end
  local g, x, y = egcd(b, a % b)
  return g, y, x - math.floor(a/b) * y
end
local g, x, y = egcd(240, 46)
local inv, _g, xi = nil, egcd(17, 3120)
local function modinv(a, m)
  local g, x = egcd(a, m)
  if g ~= 1 then return nil end
  return (x % m + m) % m
end
print(g, x, y, modinv(17, 3120))
`,
`-- Binary exponentiation + miller-rabin-ish witness
local function mpow(b, e, m)
  local r = 1 % m
  b = b % m
  while e > 0 do
    if e % 2 == 1 then r = (r * b) % m end
    b = (b * b) % m
    e = math.floor(e / 2)
  end
  return r
end
local n, a = 104729, 2
local ok = mpow(a, n-1, n) == 1
print(mpow(3, 20, 1000003), ok and 1 or 0)
`,
`-- Newton integer square root
local function isqrt(n)
  if n <= 0 then return 0 end
  local x = n
  local y = math.floor((x + 1) / 2)
  while y < x do x = y; y = math.floor((x + math.floor(n/x)) / 2) end
  return x
end
local s = 0
for n = 2, 80 do
  local r = isqrt(n * n * 3)
  s = s + r
end
print(s, isqrt(2^20))
`,
`-- Gaussian elimination 3x3
local A = {
  {2,1,-1,8},
  {-3,-1,2,-11},
  {-2,1,2,-3},
}
local n = 3
for k = 1, n do
  local piv = k
  for i = k+1, n do if math.abs(A[i][k]) > math.abs(A[piv][k]) then piv = i end end
  A[k], A[piv] = A[piv], A[k]
  for i = k+1, n do
    local f = A[i][k] / A[k][k]
    for j = k, n+1 do A[i][j] = A[i][j] - f * A[k][j] end
  end
end
local x = {}
for i = n, 1, -1 do
  local s = A[i][n+1]
  for j = i+1, n do s = s - A[i][j] * x[j] end
  x[i] = s / A[i][i]
end
print(x[1], x[2], x[3])
`,
`-- Determinant via expansion
local function det(M)
  local n = #M
  if n == 1 then return M[1][1] end
  if n == 2 then return M[1][1]*M[2][2] - M[1][2]*M[2][1] end
  local s = 0
  for j = 1, n do
    local m = {}
    for i = 2, n do
      local row = {}
      for k = 1, n do if k ~= j then row[#row+1] = M[i][k] end end
      m[#m+1] = row
    end
    local sign = (j % 2 == 1) and 1 or -1
    s = s + sign * M[1][j] * det(m)
  end
  return s
end
print(det({{6,1,1},{4,-2,5},{2,8,7}}))
`,
`-- Discrete cosine of a short signal
local x = {1,2,3,4,5,6,7,8}
local N = #x
local X = {}
for k = 0, N-1 do
  local s = 0
  for n = 0, N-1 do
    s = s + x[n+1] * math.cos(math.pi / N * (n + 0.5) * k)
  end
  X[k+1] = s
end
local h = 0
for i = 1, N do h = h + math.floor(X[i] * 100 + 0.5) * i end
print(h)
`,
`-- RK4 for y'=y, y(0)=1 over a few steps
local function f(t, y) return y end
local t, y, h, n = 0, 1, 0.1, 10
for i = 1, n do
  local k1 = f(t, y)
  local k2 = f(t + h/2, y + h*k1/2)
  local k3 = f(t + h/2, y + h*k2/2)
  local k4 = f(t + h, y + h*k3)
  y = y + h * (k1 + 2*k2 + 2*k3 + k4) / 6
  t = t + h
end
print(math.floor(y * 10000 + 0.5), math.floor(math.exp(1) * 10000 + 0.5))
`,
`-- Bisection root of x^3 - x - 2
local function f(x) return x*x*x - x - 2 end
local a, b = 1, 2
for _ = 1, 40 do
  local m = (a+b)/2
  if f(a)*f(m) <= 0 then b = m else a = m end
end
print(math.floor(((a+b)/2) * 100000 + 0.5))
`,
`-- Simpson integrate sin
local a, b, n = 0, math.pi, 20
local h = (b-a)/n
local s = math.sin(a) + math.sin(b)
for i = 1, n-1 do
  local x = a + i*h
  if i % 2 == 0 then s = s + 2 * math.sin(x) else s = s + 4 * math.sin(x) end
end
print(math.floor(s * h / 3 * 100000 + 0.5))
`,
`-- TEA block cipher 2-round checksum
local function tea(v0, v1, k)
  local sum, delta = 0, 0x9E3779B9
  local k0,k1,k2,k3 = k[1],k[2],k[3],k[4]
  for _ = 1, 8 do
    sum = (sum + delta) % 4294967296
    v0 = (v0 + (((v1*16+k0) % 4294967296) + (v1+sum) + (math.floor(v1/32)+k1))) % 4294967296
    v1 = (v1 + (((v0*16+k2) % 4294967296) + (v0+sum) + (math.floor(v0/32)+k3))) % 4294967296
  end
  return v0, v1
end
local a,b = tea(1,2,{1,2,3,4})
print(a % 100000, b % 100000)
`,
`-- RC4 KSA+PRGA stream xor checksum
local key = {1,2,3,4,5,6,7,8}
local S = {}
for i = 0, 255 do S[i] = i end
local j = 0
for i = 0, 255 do
  j = (j + S[i] + key[(i % #key)+1]) % 256
  S[i], S[j] = S[j], S[i]
end
local i, acc = 0, 0
j = 0
for n = 1, 64 do
  i = (i + 1) % 256
  j = (j + S[i]) % 256
  S[i], S[j] = S[j], S[i]
  acc = acc + S[(S[i] + S[j]) % 256]
end
print(acc)
`,
`-- Feistel 8-round 32-bit
local function F(r, k)
  r = (r + k) % 65536
  r = (r * 9 + 7) % 65536
  return math.floor(r / 2) + (r % 2) * 32768
end
local L, R = 0x1234, 0xABCD
for round = 1, 8 do
  L, R = R, (L + F(R, round * 17)) % 65536
end
print(L, R)
`,
`-- Adler-32 of a generated buffer
local n, a, b = 200, 1, 0
local MOD = 65521
for i = 1, n do
  local c = (i * 37 + 11) % 256
  a = (a + c) % MOD
  b = (b + a) % MOD
end
print(b * 65536 + a)
`,
`-- CRC-32 bitwise
local POLY = 0xEDB88320
local function u32(x) x = x % 4294967296; if x < 0 then x = x + 4294967296 end; return x end
local function bxor(a,b)
  a,b = u32(a),u32(b)
  local r,p=0,1
  for _=1,32 do
    local x,y=a%2,b%2
    if x~=y then r=r+p end
    a,b,p=(a-x)/2,(b-y)/2,p*2
  end
  return r
end
local crc = 4294967295
for i = 1, 80 do
  crc = bxor(crc, (i * 13) % 256)
  for _ = 1, 8 do
    if crc % 2 == 1 then crc = bxor(math.floor(crc/2), POLY)
    else crc = math.floor(crc/2) end
  end
end
print(bxor(crc, 4294967295))
`,
`-- FNV-1a 32-bit
local h = 2166136261
local s = "moonsec-v3-fnv-bench"
for i = 1, #s do
  h = (h + s:byte(i)) % 4294967296
  h = (h * 16777619) % 4294967296
end
print(h)
`,
`-- Base64 encode then checksum
local abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
local src = "MoonSecV3"
local bytes = {src:byte(1,#src)}
while #bytes % 3 ~= 0 do bytes[#bytes+1] = 0 end
local out = {}
for i = 1, #bytes, 3 do
  local n = bytes[i]*65536 + bytes[i+1]*256 + bytes[i+2]
  out[#out+1] = abc:sub(math.floor(n/262144)%64+1, math.floor(n/262144)%64+1)
  out[#out+1] = abc:sub(math.floor(n/4096)%64+1, math.floor(n/4096)%64+1)
  out[#out+1] = abc:sub(math.floor(n/64)%64+1, math.floor(n/64)%64+1)
  out[#out+1] = abc:sub(n%64+1, n%64+1)
end
local e = table.concat(out)
local h = 0
for i = 1, #e do h = (h * 33 + e:byte(i)) % 1000003 end
print(#e, h)
`,
`-- Run-length encode/decode
local src = {1,1,1,2,2,3,3,3,3,1,1,4,5,5,5,5,5}
local enc, i = {}, 1
while i <= #src do
  local v, n = src[i], 1
  while i+n <= #src and src[i+n] == v do n = n + 1 end
  enc[#enc+1] = n; enc[#enc+1] = v; i = i + n
end
local dec = {}
for k = 1, #enc, 2 do
  for _ = 1, enc[k] do dec[#dec+1] = enc[k+1] end
end
local ok = (#dec == #src) and 1 or 0
for j = 1, #src do if dec[j] ~= src[j] then ok = 0 end end
print(#enc, ok)
`,
`-- LZW-lite on a small alphabet
local s = "ababcbababaaaaa"
local dict, nextc = {}, 256
for i = 0, 255 do dict[string.char(i)] = i end
local w, out = "", {}
for i = 1, #s do
  local c = s:sub(i,i)
  local wc = w .. c
  if dict[wc] then w = wc
  else
    out[#out+1] = dict[w]
    dict[wc] = nextc; nextc = nextc + 1
    w = c
  end
end
if w ~= "" then out[#out+1] = dict[w] end
local h = 0
for i = 1, #out do h = (h * 131 + out[i]) % 1000003 end
print(#out, h)
`,
`-- Huffman-ish greedy length assignment
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
`,
`-- Xorshift32 stream sum
local x = 2463534242
local function xs()
  x = x % 4294967296
  x = x + ((x * 8192) % 4294967296)
  x = x % 4294967296
  local t = math.floor(x / 524288)
  x = x - t
  if x < 0 then x = x + 4294967296 end
  x = x + ((x * 4) % 4294967296)
  x = x % 4294967296
  return x
end
-- simpler xorshift
x = 123456789
local acc = 0
for i = 1, 100 do
  x = x % 4294967296
  local t = x
  t = (t * 2) % 4294967296 -- <<1 not quite, just mix
  x = (x + t + i * 997) % 4294967296
  acc = (acc + x % 1009) % 1000003
end
print(acc)
`,
`-- 1D Perlin-ish interpolated noise energy
local perm = {}
for i = 0, 15 do perm[i] = (i * 7 + 3) % 16 end
local function fade(t) return t*t*t*(t*(t*6-15)+10) end
local function lerp(a,b,t) return a + t*(b-a) end
local function grad(h, x) if h % 2 == 0 then return x else return -x end end
local function noise(x)
  local xi = math.floor(x)
  local xf = x - xi
  local u = fade(xf)
  local a = perm[xi % 16]
  local b = perm[(xi+1) % 16]
  return lerp(grad(a, xf), grad(b, xf-1), u)
end
local e = 0
for i = 0, 40 do
  local v = noise(i * 0.15)
  e = e + v * v
end
print(math.floor(e * 100000 + 0.5))
`,
`-- Graham-like convex hull monotone chain
local pts = {{0,0},{1,1},{2,2},{0,2},{2,0},{1,0},{1,2},{0.5,0.5},{1.5,1.2}}
table.sort(pts, function(a,b) if a[1]==b[1] then return a[2]<b[2] else return a[1]<b[1] end end)
local function cross(o,a,b)
  return (a[1]-o[1])*(b[2]-o[2]) - (a[2]-o[2])*(b[1]-o[1])
end
local lower = {}
for i = 1, #pts do
  while #lower >= 2 and cross(lower[#lower-1], lower[#lower], pts[i]) <= 0 do
    lower[#lower] = nil
  end
  lower[#lower+1] = pts[i]
end
local upper = {}
for i = #pts, 1, -1 do
  while #upper >= 2 and cross(upper[#upper-1], upper[#upper], pts[i]) <= 0 do
    upper[#upper] = nil
  end
  upper[#upper+1] = pts[i]
end
print(#lower + #upper - 2)
`,
`-- Bresenham line raster count
local function line(x0,y0,x1,y1)
  local dx, dy = math.abs(x1-x0), -math.abs(y1-y0)
  local sx = x0 < x1 and 1 or -1
  local sy = y0 < y1 and 1 or -1
  local err, n = dx + dy, 0
  while true do
    n = n + 1
    if x0 == x1 and y0 == y1 then break end
    local e2 = 2 * err
    if e2 >= dy then err = err + dy; x0 = x0 + sx end
    if e2 <= dx then err = err + dx; y0 = y0 + sy end
  end
  return n
end
print(line(0,0,12,7) + line(2,9,15,1))
`,
`-- Recursive-backtracker maze, then corridor count
local W, H = 11, 9
local vis, N = {}, W*H
for i = 1, N do vis[i] = false end
local function id(x,y) return (y-1)*W + x end
local walls = 0
local st = {{1,1}}
vis[id(1,1)] = true
local dirs = {{1,0},{-1,0},{0,1},{0,-1}}
while #st > 0 do
  local c = st[#st]
  local nbr = {}
  for _, d in ipairs(dirs) do
    local nx, ny = c[1]+d[1], c[2]+d[2]
    if nx>=1 and nx<=W and ny>=1 and ny<=H and not vis[id(nx,ny)] then
      nbr[#nbr+1] = {nx,ny}
    end
  end
  if #nbr == 0 then st[#st] = nil
  else
    local k = 1 + ((c[1]*13 + c[2]*7 + #st) % #nbr)
    local n = nbr[k]
    vis[id(n[1], n[2])] = true
    walls = walls + 1
    st[#st+1] = n
  end
end
local seen = 0
for i = 1, N do if vis[i] then seen = seen + 1 end end
print(seen, walls)
`,
`-- A* on a small grid with obstacles
local W, H = 8, 8
local blocked = {}
for _, p in ipairs({{3,3},{3,4},{3,5},{5,2},{5,3},{6,6}}) do
  blocked[p[1]..","..p[2]] = true
end
local function key(x,y) return x..","..y end
local function heur(x,y) return math.abs(x-W) + math.abs(y-H) end
local open, g, came = {{1,1}}, {}, {}
g[key(1,1)] = 0
local found = 0
while #open > 0 do
  local bi = 1
  for i = 2, #open do
    local a, b = open[i], open[bi]
    if (g[key(a[1],a[2])] or 1e9) + heur(a[1],a[2]) < (g[key(b[1],b[2])] or 1e9) + heur(b[1],b[2]) then bi = i end
  end
  local c = table.remove(open, bi)
  if c[1] == W and c[2] == H then found = g[key(c[1],c[2])]; break end
  for _, d in ipairs({{1,0},{-1,0},{0,1},{0,-1}}) do
    local nx, ny = c[1]+d[1], c[2]+d[2]
    if nx>=1 and nx<=W and ny>=1 and ny<=H and not blocked[key(nx,ny)] then
      local ng = (g[key(c[1],c[2])] or 1e9) + 1
      local nk = key(nx,ny)
      if ng < (g[nk] or 1e9) then
        g[nk] = ng
        open[#open+1] = {nx,ny}
      end
    end
  end
end
print(found)
`,
`-- Nim xor win-count
local function xorall(t)
  local x = 0
  for i = 1, #t do
    local a, b, r, p = x, t[i], 0, 1
    for _ = 1, 16 do
      local u, v = a % 2, b % 2
      if u ~= v then r = r + p end
      a, b, p = (a-u)/2, (b-v)/2, p*2
    end
    x = r
  end
  return x
end
local wins = 0
local st = 9090
for k = 1, 50 do
  st = st * 48271 % 2147483647
  local h = {st%8, math.floor(st/8)%8, math.floor(st/64)%8, math.floor(st/512)%8}
  if xorall(h) ~= 0 then wins = wins + 1 end
end
print(wins)
`,
`-- N-queens count for n=7
local n = 7
local col, d1, d2, sols = {}, {}, {}, 0
local function place(r)
  if r > n then sols = sols + 1; return end
  for c = 1, n do
    if not col[c] and not d1[r-c] and not d2[r+c] then
      col[c], d1[r-c], d2[r+c] = true, true, true
      place(r+1)
      col[c], d1[r-c], d2[r+c] = nil, nil, nil
    end
  end
end
place(1)
print(sols)
`,
`-- 4x4 sudoku solver, count solutions of a puzzle
local g = {
  1,0,0,4,
  0,0,1,0,
  0,4,0,0,
  3,0,0,2,
}
local function ok(i, v)
  local r, c = math.floor((i-1)/4), (i-1)%4
  for k = 0, 3 do
    if g[r*4+k+1] == v then return false end
    if g[k*4+c+1] == v then return false end
  end
  local br, bc = math.floor(r/2)*2, math.floor(c/2)*2
  for dr = 0, 1 do for dc = 0, 1 do
    if g[(br+dr)*4 + bc+dc+1] == v then return false end
  end end
  return true
end
local sols = 0
local function solve(i)
  if i > 16 then sols = sols + 1; return end
  if g[i] ~= 0 then solve(i+1); return end
  for v = 1, 4 do
    if ok(i, v) then g[i] = v; solve(i+1); g[i] = 0 end
  end
end
solve(1)
print(sols)
`,
`-- Tower of Hanoi move count via recursion
local moves = 0
local function hanoi(n, a, b, c)
  if n == 0 then return end
  hanoi(n-1, a, c, b)
  moves = moves + 1
  hanoi(n-1, c, b, a)
end
hanoi(10, 1, 3, 2)
print(moves)
`,
`-- Langton's ant on a torus
local W, H, STEPS = 21, 21, 400
local grid = {}
for y = 1, H do
  grid[y] = {}
  for x = 1, W do grid[y][x] = 0 end
end
local x, y, dir = 11, 11, 0
local dx, dy = {0,1,0,-1}, {-1,0,1,0}
for _ = 1, STEPS do
  local c = grid[y][x]
  if c == 0 then dir = (dir + 1) % 4 else dir = (dir + 3) % 4 end
  grid[y][x] = 1 - c
  x = (x + dx[dir+1] - 1) % W + 1
  y = (y + dy[dir+1] - 1) % H + 1
end
local black = 0
for yy = 1, H do for xx = 1, W do black = black + grid[yy][xx] end end
print(black, x, y, dir)
`,
`-- Rule 110 elementary CA checksum
local W, GENS = 80, 50
local row = {}
for i = 1, W do row[i] = 0 end
row[W] = 1
local function bit(L,C,R)
  local idx = L*4 + C*2 + R
  -- rule 110: 01101110
  local t = {0,1,1,1,0,1,1,0}
  return t[idx+1]
end
local sum = 0
for g = 1, GENS do
  local n = {}
  for i = 1, W do
    local L = row[i==1 and W or i-1]
    local R = row[i==W and 1 or i+1]
    n[i] = bit(L, row[i], R)
    sum = sum + n[i] * ((g+i) % 13)
  end
  row = n
end
print(sum)
`,
`-- Zeller congruence weekday histogram
local function weekday(y, m, d)
  if m < 3 then m = m + 12; y = y - 1 end
  local K, J = y % 100, math.floor(y / 100)
  local h = (d + math.floor(13*(m+1)/5) + K + math.floor(K/4) + math.floor(J/4) + 5*J) % 7
  return h
end
local hist = {}
for i = 0, 6 do hist[i] = 0 end
for y = 2000, 2020 do
  for m = 1, 12 do
    hist[weekday(y, m, 1)] = hist[weekday(y, m, 1)] + 1
  end
end
local s = 0
for i = 0, 6 do s = s + hist[i] * (i+1) end
print(s)
`,
`-- UTF-8 validator + codepoint count
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
`,
`-- Bitboard popcount + knight attacks
local function popcnt(x)
  local n = 0
  while x > 0 do n = n + x % 2; x = math.floor(x / 2) end
  return n
end
local function bit(r, f) return 2 ^ ((r-1)*8 + (f-1)) end
local knight = 0
local r0, f0 = 4, 4
for _, d in ipairs({{-2,-1},{-2,1},{-1,-2},{-1,2},{1,-2},{1,2},{2,-1},{2,1}}) do
  local r, f = r0+d[1], f0+d[2]
  if r>=1 and r<=8 and f>=1 and f<=8 then knight = knight + bit(r,f) end
end
print(popcnt(knight), knight % 1000003)
`,
`-- Interval merge then coverage
local iv = {{1,4},{2,5},{7,9},{8,10},{3,3},{12,14},{0,1}}
table.sort(iv, function(a,b) return a[1] < b[1] end)
local m = {iv[1]}
for i = 2, #iv do
  local last = m[#m]
  if iv[i][1] <= last[2] then
    if iv[i][2] > last[2] then last[2] = iv[i][2] end
  else m[#m+1] = {iv[i][1], iv[i][2]} end
end
local cov = 0
for i = 1, #m do cov = cov + (m[i][2] - m[i][1]) end
print(#m, cov)
`,
`-- Reservoir sampling checksum
local k = 7
local R = {}
local st = 4242
local function rnd() st = st * 1103515245 % 2147483648; return st end
for i = 1, k do R[i] = i * 3 end
for i = k+1, 80 do
  local j = rnd() % i
  if j < k then R[j+1] = i * 3 end
end
local s = 0
for i = 1, k do s = s + R[i] * i end
print(s)
`,
`-- 1D k-means two clusters
local x = {1,2,3,8,9,10,11,2.5,9.5,0.5}
local c1, c2 = 0, 10
for _ = 1, 12 do
  local s1, n1, s2, n2 = 0, 0, 0, 0
  for i = 1, #x do
    if math.abs(x[i]-c1) <= math.abs(x[i]-c2) then s1 = s1 + x[i]; n1 = n1 + 1
    else s2 = s2 + x[i]; n2 = n2 + 1 end
  end
  if n1 > 0 then c1 = s1 / n1 end
  if n2 > 0 then c2 = s2 / n2 end
end
print(math.floor(c1*100+0.5), math.floor(c2*100+0.5))
`,
`-- Ordinary least squares
local xs = {1,2,3,4,5,6,7,8}
local ys = {2.1,3.9,6.2,8.0,9.8,12.1,14.2,15.9}
local n, sx, sy, sxx, sxy = #xs, 0, 0, 0, 0
for i = 1, n do
  sx = sx + xs[i]; sy = sy + ys[i]
  sxx = sxx + xs[i]*xs[i]; sxy = sxy + xs[i]*ys[i]
end
local b = (n*sxy - sx*sy) / (n*sxx - sx*sx)
local a = (sy - b*sx) / n
print(math.floor(a*1000+0.5), math.floor(b*1000+0.5))
`,
`-- Decision stump on 1D labels
local x = {1,2,3,4,5,6,7,8,9,10}
local y = {-1,-1,-1,-1,1,1,1,1,1,-1}
local best, thr, pol = 1e9, 0, 1
for i = 1, #x-1 do
  local t = (x[i]+x[i+1])/2
  for p = -1, 1, 2 do
    local err = 0
    for j = 1, #x do
      local pred = (x[j] < t) and p or -p
      if pred ~= y[j] then err = err + 1 end
    end
    if err < best then best = err; thr = t; pol = p end
  end
end
print(best, math.floor(thr*10), pol)
`,
`-- Markov chain next-char frequencies
local text = "ababacabadaba"
local freq = {}
for i = 1, #text-1 do
  local a, b = text:sub(i,i), text:sub(i+1,i+1)
  freq[a] = freq[a] or {}
  freq[a][b] = (freq[a][b] or 0) + 1
end
local h = 0
for a, row in pairs(freq) do
  for b, c in pairs(row) do
    h = h + a:byte() * 131 + b:byte() * c
  end
end
print(h)
`,
`-- Bloom filter false-positive probe
local M, K = 128, 3
local bits = {}
for i = 1, M do bits[i] = 0 end
local function h1(s)
  local x = 0
  for i = 1, #s do x = (x * 31 + s:byte(i)) % M end
  return x + 1
end
local function h2(s)
  local x = 7
  for i = 1, #s do x = (x * 17 + s:byte(i) * 13) % M end
  return x + 1
end
local function add(s)
  local a, b = h1(s), h2(s)
  for i = 0, K-1 do bits[((a-1 + i*(b-1)) % M)+1] = 1 end
end
local function has(s)
  local a, b = h1(s), h2(s)
  for i = 0, K-1 do if bits[((a-1 + i*(b-1)) % M)+1] == 0 then return 0 end end
  return 1
end
for _, w in ipairs({"alpha","beta","gamma","delta"}) do add(w) end
print(has("alpha")+has("beta")+has("zeta")+has("omega"))
`,
`-- LRU cache simulation
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
`,
`-- Circular deque ops checksum
local cap = 8
local buf, lo, hi, n = {}, 1, 1, 0
for i = 1, cap do buf[i] = 0 end
local function pushL(x)
  lo = lo - 1; if lo < 1 then lo = cap end
  buf[lo] = x; n = n + 1
end
local function pushR(x)
  buf[hi] = x; hi = hi + 1; if hi > cap then hi = 1 end
  n = n + 1
end
local function popL()
  local v = buf[lo]; lo = lo + 1; if lo > cap then lo = 1 end; n = n - 1; return v
end
local function popR()
  hi = hi - 1; if hi < 1 then hi = cap end; n = n - 1; return buf[hi]
end
for i = 1, 5 do pushR(i) end
pushL(9); pushL(8)
local a, b = popR(), popL()
local s = a + b
local i = lo
for _ = 1, n do s = s + buf[i]*3; i = i + 1; if i > cap then i = 1 end end
print(s, n)
`,
`-- Sparse matrix-vector multiply
local N, NZ = 12, 30
local st = 88
local function rnd() st = st * 48271 % 2147483647; return st end
local row, col, val, x, y = {}, {}, {}, {}, {}
for i = 1, N do x[i] = (rnd() % 21) - 10; y[i] = 0 end
for k = 1, NZ do
  row[k] = 1 + (rnd() % N)
  col[k] = 1 + (rnd() % N)
  val[k] = (rnd() % 9) - 4
end
for k = 1, NZ do y[row[k]] = y[row[k]] + val[k] * x[col[k]] end
local s = 0
for i = 1, N do s = s + y[i] * y[i] end
print(s)
`,
`-- Schoolbook polynomial multiply
local N = 18
local st = 2468
local function rnd() st = st * 48271 % 2147483647; return st end
local a, b, c = {}, {}, {}
for i = 1, N do a[i] = (rnd()%9)-4; b[i] = (rnd()%9)-4 end
for i = 1, 2*N-1 do c[i] = 0 end
for i = 1, N do
  for j = 1, N do c[i+j-1] = c[i+j-1] + a[i]*b[j] end
end
local h = 0
for i = 1, #c do h = (h * 17 + (c[i] % 1009 + 1009) % 1009) % 1000003 end
print(h)
`,
`-- Levenshtein distance
local function randstr(seed, n)
  local t, s = {}, seed
  for i = 1, n do s = s * 48271 % 2147483647; t[i] = 97 + (s % 6) end
  return t
end
local a, b = randstr(13579, 22), randstr(24680, 20)
local n, m = #a, #b
local dp = {}
for i = 0, n do dp[i] = {}; dp[i][0] = i end
for j = 0, m do dp[0][j] = j end
for i = 1, n do
  for j = 1, m do
    local c = (a[i] == b[j]) and 0 or 1
    dp[i][j] = math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+c)
  end
end
print(dp[n][m])
`,
`-- Manacher odd-palindrome radius sum
local s = "abacabaabcba"
local n = #s
local rad, sum = {}, 0
for i = 1, n do
  local r = 0
  while i-r >= 1 and i+r <= n and s:sub(i-r,i-r) == s:sub(i+r,i+r) do r = r + 1 end
  rad[i] = r - 1
  sum = sum + rad[i]
end
print(sum, rad[4])
`,
`-- Z-algorithm sum
local s = "aabcaabxaaaz"
local n = #s
local z = {0}
local l, r = 0, 0
for i = 2, n do
  z[i] = 0
  if i <= r then z[i] = math.min(r-i+1, z[i-l+1]) end
  while i+z[i] <= n and s:sub(z[i]+1, z[i]+1) == s:sub(i+z[i], i+z[i]) do
    z[i] = z[i] + 1
  end
  if i+z[i]-1 > r then l = i; r = i+z[i]-1 end
end
local sm = 0
for i = 2, n do sm = sm + z[i] end
print(sm)
`,
`-- Chinese remainder theorem two moduli
local function egcd(a,b)
  if b == 0 then return a,1,0 end
  local g,x,y = egcd(b, a%b)
  return g, y, x - math.floor(a/b)*y
end
local function crt(a1,m1,a2,m2)
  local g, x = egcd(m1, m2)
  local m = m1 * m2
  local t = (a2 - a1) * x % m2
  return (a1 + m1 * t) % m
end
print(crt(2,3,3,5), crt(1,7,3,11))
`,
`-- Bellman-Ford with a negative edge
local n = 5
local edges = {{1,2,6},{1,3,7},{2,3,8},{2,4,5},{2,5,-4},{3,4,-3},{3,5,9},{4,5,7},{5,2,2}}
local d = {}
for i = 1, n do d[i] = 1e9 end
d[1] = 0
for _ = 1, n-1 do
  for _, e in ipairs(edges) do
    if d[e[1]] + e[3] < d[e[2]] then d[e[2]] = d[e[1]] + e[3] end
  end
end
local s = 0
for i = 1, n do s = s + d[i] end
print(s)
`,
`-- Prim MST
local n = 6
local w = {}
for i = 1, n do
  w[i] = {}
  for j = 1, n do w[i][j] = 1e9 end
  w[i][i] = 0
end
local function set(u,v,c) w[u][v]=c; w[v][u]=c end
set(1,2,4); set(1,3,1); set(2,3,3); set(2,4,2); set(3,4,5); set(3,5,6); set(4,5,7); set(4,6,8); set(5,6,3)
local used, dist, cost = {}, {}, 0
for i = 1, n do used[i]=false; dist[i]=1e9 end
dist[1] = 0
for _ = 1, n do
  local u, best = -1, 1e9
  for i = 1, n do if not used[i] and dist[i] < best then best = dist[i]; u = i end end
  used[u] = true; cost = cost + dist[u]
  for v = 1, n do
    if not used[v] and w[u][v] < dist[v] then dist[v] = w[u][v] end
  end
end
print(cost)
`,
`-- Counting sort of bounded ints
local a = {4,2,2,8,3,3,1,0,9,4,5,5,7,6,1}
local mx = 0
for i = 1, #a do if a[i] > mx then mx = a[i] end end
local cnt = {}
for i = 0, mx do cnt[i] = 0 end
for i = 1, #a do cnt[a[i]] = cnt[a[i]] + 1 end
local k = 1
for v = 0, mx do
  for _ = 1, cnt[v] do a[k] = v; k = k + 1 end
end
local s = 0
for i = 1, #a do s = s + a[i] * i end
print(s)
`,
`-- Interpolation search hits
local a = {}
for i = 1, 50 do a[i] = i * 3 end
local function isearch(x)
  local lo, hi = 1, #a
  while lo <= hi and x >= a[lo] and x <= a[hi] do
    if lo == hi then return a[lo] == x and lo or -1 end
    local pos = lo + math.floor((x - a[lo]) * (hi - lo) / (a[hi] - a[lo]))
    if a[pos] == x then return pos
    elseif a[pos] < x then lo = pos + 1
    else hi = pos - 1 end
  end
  return -1
end
local hits = 0
for x = 0, 160, 3 do if isearch(x) > 0 then hits = hits + 1 end end
print(hits)
`,
`-- Matrix-chain order DP (min multiplies)
local p = {10, 20, 5, 8, 15, 4}
local n = #p - 1
local dp = {}
for i = 1, n do dp[i] = {}; for j = 1, n do dp[i][j] = 0 end end
for L = 2, n do
  for i = 1, n-L+1 do
    local j = i+L-1
    dp[i][j] = 1e18
    for k = i, j-1 do
      local q = dp[i][k] + dp[k+1][j] + p[i]*p[k+1]*p[j+1]
      if q < dp[i][j] then dp[i][j] = q end
    end
  end
end
print(dp[1][n])
`,
`-- 15-puzzle manhattan sum of a scramble
local board = {5,1,2,3, 9,6,7,4, 13,10,11,8, 0,14,15,12}
local function manhattan()
  local s = 0
  for i = 1, 16 do
    local v = board[i]
    if v ~= 0 then
      local r, c = math.floor((i-1)/4), (i-1)%4
      local tr, tc = math.floor((v-1)/4), (v-1)%4
      s = s + math.abs(r-tr) + math.abs(c-tc)
    end
  end
  return s
end
print(manhattan())
`,
`-- JSON-lite number/array parser
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
`,
`-- AABB sweep: count overlapping pairs
local boxes = {
  {0,0,2,2},{1,1,3,3},{4,0,5,1},{2,2,6,6},{5,5,7,8},{10,10,11,11}
}
local function overlap(a,b)
  return a[1] < b[3] and b[1] < a[3] and a[2] < b[4] and b[2] < a[4]
end
local n = 0
for i = 1, #boxes do
  for j = i+1, #boxes do
    if overlap(boxes[i], boxes[j]) then n = n + 1 end
  end
end
print(n)
`,
`-- Voronoi nearest-site assignment
local sites = {{2,2},{8,1},{5,7},{1,8},{9,9}}
local W, H = 10, 10
local hist = {}
for i = 1, #sites do hist[i] = 0 end
for y = 0, H-1 do
  for x = 0, W-1 do
    local bi, bd = 1, 1e18
    for i, s in ipairs(sites) do
      local d = (x-s[1])^2 + (y-s[2])^2
      if d < bd then bd = d; bi = i end
    end
    hist[bi] = hist[bi] + 1
  end
end
local h = 0
for i = 1, #hist do h = h + hist[i] * i end
print(h)
`,
`-- Shell sort with gaps
local a = {23,12,1,8,17,5,19,4,16,2,11,7,20,3,14}
local n = #a
local gap = math.floor(n/2)
while gap > 0 do
  for i = gap+1, n do
    local tmp, j = a[i], i
    while j > gap and a[j-gap] > tmp do
      a[j] = a[j-gap]; j = j - gap
    end
    a[j] = tmp
  end
  gap = math.floor(gap/2)
end
local s = 0
for i = 1, n do s = s + a[i]*i end
print(s, a[1], a[n])
`,
`-- Treap-like implicit split size checksum (cartesian tree)
local keys = {5,2,8,1,7,3,9,4,6}
local prio = {3,9,1,8,2,7,4,6,5}
local function build(lo, hi)
  if lo > hi then return nil end
  local m = lo
  for i = lo+1, hi do if prio[i] < prio[m] then m = i end end
  return {k=keys[m], p=prio[m], l=build(lo,m-1), r=build(m+1,hi)}
end
local root = build(1, #keys)
local sum = 0
local function walk(n, d)
  if not n then return end
  sum = sum + n.k * (d+1)
  walk(n.l, d+1); walk(n.r, d+1)
end
walk(root, 0)
print(sum)
`,
`-- Skiplist-ish probabilistic insert height histogram
local st = 777
local function rnd() st = st * 1103515245 % 2147483648; return st end
local hist = {0,0,0,0,0,0}
for i = 1, 80 do
  local h, x = 1, rnd()
  while h < 6 and x % 2 == 0 do h = h + 1; x = math.floor(x/2) end
  hist[h] = hist[h] + 1
end
local s = 0
for i = 1, 6 do s = s + hist[i] * i * i end
print(s)
`,
`-- Murmur-ish mix of 16 keys
local function rotl(x, r)
  r = r % 32
  local a = (x * (2^r)) % 4294967296
  local b = math.floor(x / (2^(32-r)))
  return (a + b) % 4294967296
end
local h = 0x9747b28c
for i = 1, 16 do
  local k = (i * 0xcc9e2d51) % 4294967296
  k = rotl(k, 15)
  h = (h + k) % 4294967296
  h = rotl(h, 13)
  h = (h * 5 + 0xe6546b64) % 4294967296
end
print(h)
`,
`-- XTEA 8 cycles
local function u32(x) x = x % 4294967296; if x < 0 then x = x + 4294967296 end; return x end
local v0, v1 = 1, 2
local k = {9,8,7,6}
local sum, delta = 0, 0x9E3779B9
for _ = 1, 8 do
  v0 = u32(v0 + u32(u32(u32(v1*16) + k[1]) + u32(v1 + sum) + u32(math.floor(v1/32) + k[2])))
  sum = u32(sum + delta)
  v1 = u32(v1 + u32(u32(u32(v0*16) + k[3]) + u32(v0 + sum) + u32(math.floor(v0/32) + k[4])))
end
print(v0 % 1000003, v1 % 1000003)
`,
`-- Continued fraction of sqrt(19) period checksum
local S = 19
local a0 = math.floor(math.sqrt(S))
local m, d, a = 0, 1, a0
local seen, period, h = {}, 0, 0
for i = 1, 40 do
  m = d * a - m
  d = math.floor((S - m*m) / d)
  a = math.floor((a0 + m) / d)
  h = (h * 10 + a) % 1000003
  local key = m..":"..d..":"..a
  if seen[key] then period = i - seen[key]; break end
  seen[key] = i
end
print(h, period)
`,
`-- LU-lite 3x3 (no pivoting) then residual
local A = {{2,1,1},{4,-6,0},{-2,7,2}}
local n = 3
local L, U = {}, {}
for i = 1, n do
  L[i] = {}; U[i] = {}
  for j = 1, n do L[i][j]=0; U[i][j]=0 end
end
for i = 1, n do
  for k = i, n do
    local s = 0
    for j = 1, i-1 do s = s + L[i][j]*U[j][k] end
    U[i][k] = A[i][k] - s
  end
  for k = i, n do
    if i == k then L[i][i] = 1
    else
      local s = 0
      for j = 1, i-1 do s = s + L[k][j]*U[j][i] end
      L[k][i] = (A[k][i] - s) / U[i][i]
    end
  end
end
local s = 0
for i = 1, n do for j = 1, n do s = s + L[i][j]*10 + U[i][j] end end
print(math.floor(s*1000+0.5))
`,
`-- Pollard Rho-lite gcd loop on n=8051
local function gcd(a,b) while b ~= 0 do a,b = b, a%b end; return a end
local n = 8051
local x, y, d, c = 2, 2, 1, 1
local function f(v) return (v*v + c) % n end
local steps = 0
while d == 1 do
  x = f(x); y = f(f(y))
  d = gcd(math.abs(x-y), n)
  steps = steps + 1
  if steps > 200 then break end
end
print(d, steps)
`,
`-- Calendar day-of-year + leap
local function leap(y)
  return (y % 4 == 0 and y % 100 ~= 0) or (y % 400 == 0)
end
local md = {31,28,31,30,31,30,31,31,30,31,30,31}
local function doy(y,m,d)
  local s = d
  for i = 1, m-1 do s = s + md[i] end
  if m > 2 and leap(y) then s = s + 1 end
  return s
end
local acc = 0
for y = 1990, 2020 do acc = acc + doy(y, 8, 15) + (leap(y) and 1 or 0) end
print(acc)
`,
`-- Bitboard rook attacks on empty board from d4
local function bit(r,f) return 2^((r-1)*8+(f-1)) end
local att, r0, f0 = 0, 4, 4
for f = 1, 8 do if f ~= f0 then att = att + bit(r0,f) end end
for r = 1, 8 do if r ~= r0 then att = att + bit(r,f0) end end
local function pop(x)
  local n=0; while x>0 do n=n+x%2; x=math.floor(x/2) end; return n
end
print(pop(att))
`,
`-- Reservoir-free weighted random wheel checksum
local w = {3,1,4,1,5,9,2,6}
local st = 31415
local function rnd() st = st * 48271 % 2147483647; return st end
local tot = 0
for i = 1, #w do tot = tot + w[i] end
local hist = {}
for i = 1, #w do hist[i] = 0 end
for _ = 1, 200 do
  local t = rnd() % tot
  local acc = 0
  for i = 1, #w do
    acc = acc + w[i]
    if t < acc then hist[i] = hist[i] + 1; break end
  end
end
local s = 0
for i = 1, #w do s = s + hist[i] * i end
print(s)
`,
`-- Minimax of a tiny 3-heap Nim (depth-limited)
local function xor3(a,b,c)
  local function x2(x,y)
    local r,p=0,1
    for _=1,8 do
      local u,v=x%2,y%2
      if u~=v then r=r+p end
      x,y,p=(x-u)/2,(y-v)/2,p*2
    end
    return r
  end
  return x2(x2(a,b),c)
end
local function win(a,b,c)
  return xor3(a,b,c) ~= 0
end
local n = 0
for a = 0, 4 do
  for b = 0, 4 do
    for c = 0, 4 do
      if win(a,b,c) then n = n + 1 end
    end
  end
end
print(n)
`,
`-- String-intern table + interned concat count
local intern, nid = {}, 0
local function I(s)
  if intern[s] then return intern[s] end
  nid = nid + 1; intern[s] = nid; return nid
end
local words = {"moon","sec","v3","lua","vm","byte","code","obf"}
local last = I("")
local acc = 0
for i = 1, #words do
  for j = i, #words do
    local id = I(words[i] .. words[j])
    acc = acc + id
  end
end
print(nid, acc)
`,
`-- Cycle detection (Floyd) on a functional graph
local n = 30
local nxt = {}
for i = 1, n do nxt[i] = 1 + (i * 7 + 3) % n end
local function floyd(start)
  local t, h = start, start
  repeat t = nxt[t]; h = nxt[nxt[h]] until t == h
  local mu, t2 = 0, start
  while t2 ~= t do t2 = nxt[t2]; t = nxt[t]; mu = mu + 1 end
  local lam, h2 = 1, nxt[t]
  while h2 ~= t do h2 = nxt[h2]; lam = lam + 1 end
  return mu, lam
end
local mu, lam = floyd(1)
print(mu, lam)
`,
`-- Prefix-sum 2D rectangle query
local n = 6
local a = {}
for i = 1, n do
  a[i] = {}
  for j = 1, n do a[i][j] = (i*3 + j*7) % 11 end
end
local ps = {}
for i = 0, n do ps[i] = {}; for j = 0, n do ps[i][j] = 0 end end
for i = 1, n do
  for j = 1, n do
    ps[i][j] = a[i][j] + ps[i-1][j] + ps[i][j-1] - ps[i-1][j-1]
  end
end
local function q(r1,c1,r2,c2)
  return ps[r2][c2] - ps[r1-1][c2] - ps[r2][c1-1] + ps[r1-1][c1-1]
end
print(q(2,2,5,5), q(1,1,6,6))
`,
`-- Josephus problem f(n,k)
local function josephus(n, k)
  local q = {}
  for i = 1, n do q[i] = i end
  local idx = 1
  while #q > 1 do
    idx = ((idx - 1 + k - 1) % #q) + 1
    table.remove(q, idx)
  end
  return q[1]
end
print(josephus(41, 3), josephus(10, 2))
`,
`-- Stable partition then checksum
local a = {4,-1,3,0,-2,8,-7,5,1,-3,6}
local function stable(pred)
  local yes, no = {}, {}
  for i = 1, #a do
    if pred(a[i]) then yes[#yes+1] = a[i] else no[#no+1] = a[i] end
  end
  local o = {}
  for i = 1, #yes do o[#o+1] = yes[i] end
  for i = 1, #no do o[#o+1] = no[i] end
  return o
end
local o = stable(function(x) return x >= 0 end)
local s = 0
for i = 1, #o do s = s + o[i] * i end
print(s)
`,
`-- Dancing-links-free exact cover of a tiny set
local U = 7
local sets = {
  {1,4,7},
  {1,4},
  {4,5,7},
  {3,5,6},
  {2,3,6,7},
  {2,7},
}
local best = 99
local function cover(mask, used, cnt)
  if mask == (2^U - 1) then if cnt < best then best = cnt end; return end
  if cnt >= best then return end
  for i = 1, #sets do
    if used % (2^i) < 2^(i-1) then
      local m = mask
      for _, x in ipairs(sets[i]) do m = m + ((math.floor(m / 2^(x-1)) % 2 == 0) and 2^(x-1) or 0) end
      cover(m, used + 2^(i-1), cnt+1)
    end
  end
end
cover(0, 0, 0)
print(best)
`,
`-- Cordic-lite rotation to compute hypot checksum
local x, y = 121, 50
local ang = 0
local p2 = 1
for i = 0, 12 do
  local d = (y < 0) and -1 or 1
  local nx = x + d * y / p2
  local ny = y - d * x / p2
  x, y = nx, ny
  p2 = p2 * 2
end
print(math.floor(x + 0.5), math.floor(y + 0.5))
`,
`-- Earley-free balanced-paren DP count (Catalan via DP)
local N = 10
local C = {1}
for n = 1, N do
  local s = 0
  for i = 0, n-1 do s = s + C[i+1] * C[n-i] end
  C[n+1] = s
end
print(C[N+1])
`,
`-- Min-cost path in a triangle
local tri = {
  {2},
  {3,4},
  {6,5,7},
  {4,1,8,3},
  {9,2,6,4,5},
}
for r = #tri-1, 1, -1 do
  for c = 1, r do
    tri[r][c] = tri[r][c] + math.min(tri[r+1][c], tri[r+1][c+1])
  end
end
print(tri[1][1])
`,
`-- Sparse union of sorted integer lists
local function mergeuniq(a,b)
  local i,j,o = 1,1,{}
  while i <= #a and j <= #b do
    if a[i] < b[j] then o[#o+1]=a[i]; i=i+1
    elseif b[j] < a[i] then o[#o+1]=b[j]; j=j+1
    else o[#o+1]=a[i]; i=i+1; j=j+1 end
  end
  while i <= #a do o[#o+1]=a[i]; i=i+1 end
  while j <= #b do o[#o+1]=b[j]; j=j+1 end
  return o
end
local a = {1,3,5,7,9,12,15}
local b = {2,3,7,8,12,20}
local c = {0,3,12,21}
local u = mergeuniq(mergeuniq(a,b), c)
local s = 0
for i = 1, #u do s = s + u[i]*i end
print(#u, s)
`,
`-- Gray code generation xor checksum
local nbits = 6
local N = 2^nbits
local s = 0
for i = 0, N-1 do
  local g = 0
  local x, y = i, math.floor(i/2)
  local r,p=0,1
  for _=1,16 do
    local u,v=x%2,y%2
    if u~=v then r=r+p end
    x,y,p=(x-u)/2,(y-v)/2,p*2
  end
  g = r
  s = (s + g * (i+1)) % 1000003
end
print(s)
`,
`-- Topological generations (levelization)
local n = 8
local adj, indeg = {}, {}
for i = 1, n do adj[i] = {}; indeg[i] = 0 end
local function e(u,v) adj[u][#adj[u]+1]=v; indeg[v]=indeg[v]+1 end
e(1,3); e(1,4); e(2,4); e(2,5); e(3,6); e(4,6); e(4,7); e(5,7); e(6,8); e(7,8)
local lvl, q, qh, qt = {}, {}, 1, 0
for i = 1, n do
  lvl[i] = 0
  if indeg[i] == 0 then qt = qt + 1; q[qt] = i end
end
while qh <= qt do
  local u = q[qh]; qh = qh + 1
  for _, v in ipairs(adj[u]) do
    if lvl[u]+1 > lvl[v] then lvl[v] = lvl[u]+1 end
    indeg[v] = indeg[v] - 1
    if indeg[v] == 0 then qt = qt + 1; q[qt] = v end
  end
end
local s = 0
for i = 1, n do s = s + lvl[i] * i end
print(s)
`,
`-- String matching via naive + unique skip table mix (Sunday-ish)
local text = "gcagagagctgcagagcgca"
local pat = "gcagagcg"
local n, m = #text, #pat
local shift = {}
for i = 0, 255 do shift[i] = m + 1 end
for i = 1, m do shift[pat:byte(i)] = m - i + 1 end
local pos, hits = 1, 0
while pos <= n - m + 1 do
  local ok = true
  for i = 1, m do
    if text:sub(pos+i-1,pos+i-1) ~= pat:sub(i,i) then ok = false; break end
  end
  if ok then hits = hits + 1 end
  if pos + m <= n then pos = pos + shift[text:byte(pos+m)] else break end
end
print(hits)
`,
`-- Cubic bezier sampled length
local function bez(p0,p1,p2,p3,t)
  local u = 1-t
  return u*u*u*p0 + 3*u*u*t*p1 + 3*u*t*t*p2 + t*t*t*p3
end
local len, px, py = 0, bez(0,1,2,3,0), bez(0,2,0,1,0)
for i = 1, 20 do
  local t = i/20
  local x, y = bez(0,1,2,3,t), bez(0,2,0,1,t)
  local dx, dy = x-px, y-py
  len = len + math.sqrt(dx*dx + dy*dy)
  px, py = x, y
end
print(math.floor(len * 1000 + 0.5))
`,
`-- Sparse Cholesky-free 2x2 SPD solve
local a11, a12, a22 = 4, 1, 3
local b1, b2 = 1, 2
local det = a11*a22 - a12*a12
local x1 = ( b1*a22 - b2*a12) / det
local x2 = (-b1*a12 + b2*a11) / det
print(math.floor(x1*1000+0.5), math.floor(x2*1000+0.5))
`,
`-- Run a linear congruential then Kolmogorov-lite gap score
local a, c, m, x = 1664525, 1013904223, 2^32, 42
local bins = {}
for i = 1, 10 do bins[i] = 0 end
for i = 1, 200 do
  x = (a * x + c) % m
  local b = math.floor(x / m * 10) + 1
  if b > 10 then b = 10 end
  bins[b] = bins[b] + 1
end
local chi = 0
local exp = 20
for i = 1, 10 do
  local d = bins[i] - exp
  chi = chi + d*d / exp
end
print(math.floor(chi * 100 + 0.5))
`,
`-- Monotone stack next-greater-element sum
local a = {2,1,2,4,3,1,5,2,6,3}
local st, nge = {}, {}
for i = #a, 1, -1 do
  while #st > 0 and a[st[#st]] <= a[i] do st[#st] = nil end
  nge[i] = (#st > 0) and a[st[#st]] or -1
  st[#st+1] = i
end
local s = 0
for i = 1, #a do s = s + nge[i] * i end
print(s)
`,
`-- Edit script length via DP (replace/insert/delete weighted)
local a, b = "kitten", "sitting"
local n, m = #a, #b
local dp = {}
for i = 0, n do dp[i] = {}; dp[i][0] = i * 2 end
for j = 0, m do dp[0][j] = j * 2 end
for i = 1, n do
  for j = 1, m do
    local cost = (a:sub(i,i) == b:sub(j,j)) and 0 or 3
    dp[i][j] = math.min(dp[i-1][j] + 2, dp[i][j-1] + 2, dp[i-1][j-1] + cost)
  end
end
print(dp[n][m])
`,
`-- Prefix function (KMP pi) checksum of a string
local s = "ababababca"
local n = #s
local pi = {0}
for i = 2, n do
  local j = pi[i-1]
  while j > 0 and s:sub(i,i) ~= s:sub(j+1,j+1) do j = pi[j] end
  if s:sub(i,i) == s:sub(j+1,j+1) then j = j + 1 end
  pi[i] = j
end
local sm = 0
for i = 1, n do sm = sm + pi[i] * i end
print(sm)
`,
`-- Fenwick tree range-sum after updates
local n = 16
local bit = {}
for i = 1, n do bit[i] = 0 end
local function add(i, v)
  while i <= n do bit[i] = bit[i] + v; i = i + (i % (2*i - i) == 0 and i or (i % 2 == 0 and 2 or 1))
    -- simpler: i := i + i&-i simulated
    local x, p = i, 1
    while x % 2 == 0 do x = x / 2; p = p * 2 end
    -- actually use lowbit via loop
    break
  end
end
-- proper fenwick
bit = {}; for i = 1, n do bit[i] = 0 end
local function lowbit(x)
  local p = 1
  while x % 2 == 0 do x = x / 2; p = p * 2 end
  return p
end
local function upd(i, v)
  while i <= n do bit[i] = bit[i] + v; i = i + lowbit(i) end
end
local function pref(i)
  local s = 0
  while i > 0 do s = s + bit[i]; i = i - lowbit(i) end
  return s
end
for i = 1, n do upd(i, i) end
print(pref(10) - pref(3), pref(16))
`,
`-- Sparse table RMQ (min)
local a = {4,2,7,1,9,3,5,8,6,0,4,2}
local n = #a
local LOG = 4
local st = {}
for i = 1, n do st[i] = {}; st[i][0] = a[i] end
local p2 = {1}
for k = 1, LOG do p2[k+1] = p2[k]*2 end
for k = 1, LOG do
  local len = p2[k+1]
  for i = 1, n-len+1 do
    st[i][k] = math.min(st[i][k-1], st[i+p2[k]][k-1])
  end
end
local function lg(x)
  local k = 0
  while p2[k+2] and p2[k+2] <= x do k = k + 1 end
  return k
end
local function rmq(l,r)
  local k = lg(r-l+1)
  return math.min(st[l][k], st[r-p2[k+1]+1][k])
end
print(rmq(1,12), rmq(3,8), rmq(5,5))
`,
`-- Cycle sort write-count
local a = {5,2,4,1,3,6,2}
local writes = 0
local n = #a
for cyc = 1, n-1 do
  local item = a[cyc]
  local pos = cyc
  for i = cyc+1, n do if a[i] < item then pos = pos + 1 end end
  if pos == cyc then -- already
  else
    while item == a[pos] do pos = pos + 1 end
    a[pos], item = item, a[pos]
    writes = writes + 1
    while pos ~= cyc do
      pos = cyc
      for i = cyc+1, n do if a[i] < item then pos = pos + 1 end end
      while item == a[pos] do pos = pos + 1 end
      a[pos], item = item, a[pos]
      writes = writes + 1
    end
  end
end
local s = 0
for i = 1, n do s = s + a[i]*i end
print(s, writes)
`,
  ];
}

module.exports = { benches };
