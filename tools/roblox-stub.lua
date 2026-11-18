-- Headless harness: emulate the subset of the Roblox API a script touches, so an
-- obfuscated script can be executed under plain Lua 5.1/LuaJIT and any VM-level
-- fault (nil index, bad register, broken closure) shows up with a position.
--
-- Usage: lua tools/roblox-stub.lua <script.lua>
-- Exit 0 = top level ran; 1 = runtime error; 2 = load error.

local path = assert(arg[1], "usage: lua tools/roblox-stub.lua <script.lua> [drive]")
io.stdout:setvbuf("no"); io.stderr:setvbuf("no")

local function noop() end

-------------------------------------------------------------------------- datatypes
local Vector3 = {}
Vector3.__index = function(_, k)
  if k == "Magnitude" then return 0 end
  if k == "Unit" then return Vector3.new() end
  return Vector3[k]
end
function Vector3.new(x, y, z)
  return setmetatable({ X = x or 0, Y = y or 0, Z = z or 0 }, Vector3)
end
Vector3.zero = Vector3.new(0, 0, 0)
Vector3.one = Vector3.new(1, 1, 1)

local CFrame = {}
CFrame.__index = function(_, k)
  if k == "Position" then return Vector3.new() end
  if k == "LookVector" then return Vector3.new() end
  return CFrame.new()
end
function CFrame.new() return setmetatable({}, CFrame) end
CFrame.fromEulerAnglesXYZ = CFrame.new
CFrame.Angles = CFrame.new

local Color3 = { fromRGB = function(r, g, b) return { R = r or 0, G = g or 0, B = b or 0 } end }
Color3.new = Color3.fromRGB

local Enum = setmetatable({}, {
  __index = function(t, family)
    local g = setmetatable({}, { __index = function(_, key)
      return { EnumType = family, Name = key, Value = 0 } end })
    rawset(t, family, g); return g
  end,
})

-------------------------------------------------------------------------- instances
-- Methods with real behaviour; everything else on an instance resolves to a
-- cached child Instance so `A.B.C.D` chains stay indexable.
local METHODS = {
  IsA = function() return true end,
  GetChildren = function() return {} end,
  GetDescendants = function() return {} end,
  GetPivot = function() return CFrame.new() end,
  PivotTo = function(self) return self end,
  SetStateEnabled = noop,
  GetStateEnabled = function() return true end,
  ChangeState = noop,
  TranslateBy = noop,
  FireServer = noop,
  Raycast = function() return nil end,
  WaitForChild = function(self) return self end,
  FindFirstChild = function(self, n) return newObject("Instance", n) end,
  FindFirstChildOfClass = function(self, n) return newObject(n, n) end,
  FindFirstChildWhichIsA = function(self, n) return newObject("Instance", n) end,
  Connect = function(_, fn)
    if type(fn) == "function" then DRIVEN.signals[#DRIVEN.signals + 1] = fn end
    return { Disconnect = noop }
  end,
  Destroy = noop,
  Clone = function(self) return self end,
  GetService = function(_, n) return newObject(n, n) end,
  HttpGet = function() return "-- headless stub" end,
}

local PROPS = {
  Health = 100, MaxHealth = 100, WalkSpeed = 16, JumpPower = 50,
  Position = Vector3.new(), Size = Vector3.new(), Magnitude = 0,
  BreakJointsOnDeath = true, RequiresNeck = true, CanCollide = true,
  MoveDirection = Vector3.new(), CameraSubject = nil, LocalPlayer = nil,
}

local Instance = {}
Instance.__index = function(t, k)
  local raw = rawget(t, k)
  if raw ~= nil then return raw end
  if k == "Parent" then return rawget(t, "_parent") end
  if k == "Name" then return rawget(t, "_name") end
  if k == "CFrame" then return CFrame.new() end
  if PROPS[k] ~= nil then return PROPS[k] end
  if METHODS[k] then
    rawset(t, k, METHODS[k])
    return METHODS[k]
  end
  -- Event-looking members are signals; anything else is a child instance.
  if k == "Event" or k == "Changed" or k == "Touched" or k == "JumpRequest"
     or k:match("Heartbeat$") or k:match("Request$") or k:match("Died$") then
    local s = { Connect = function(_, fn)
                  if type(fn) == "function" then DRIVEN.signals[#DRIVEN.signals + 1] = fn end
                  return { Disconnect = noop }
                end, Wait = noop }
    rawset(t, k, s); return s
  end
  local child = newObject("Instance", k)
  rawset(t, k, child)
  return child
end

function newObject(class, name)
  return setmetatable({ _name = name or class, ClassName = class }, Instance)
end

------------------------------------------------------------------------ environment
-- Records every CallBack a script registers, plus every event handler, so the
-- harness can drive them after load instead of only checking that loading works.
DRIVEN = { callbacks = {}, signals = {} }

local function collectCallbacks(spec, out, depth)
  if type(spec) ~= "table" or (depth or 0) > 2 then return end
  if type(spec.CallBack) == "function" then out[#out + 1] = spec end
  for _, v in pairs(spec) do
    if type(v) == "table" and v ~= spec then collectCallbacks(v, out, (depth or 0) + 1) end
  end
end

local function ui()
  local c
  c = setmetatable({}, {
    __index = function(_, k)
      if k == "Parent" then return nil end
      if k == "Name" or k == "Title" or k == "Status" or k == "SubText" then return "Stub" end
      return function(_, spec)
        collectCallbacks(spec, DRIVEN.callbacks)
        return ui()
      end
    end,
    __call = function(_, spec) collectCallbacks(spec, DRIVEN.callbacks); return ui() end,
  })
  return c
end

local env = {}
env._G = env
env.game = setmetatable({
  GetService = function(_, name) return newObject(name, name) end,
  HttpGet = function(_, url) return "-- headless stub for " .. tostring(url) end,
}, { __index = function(t, k) local v = newObject("Instance", k); rawset(t, k, v); return v end })
env.workspace = newObject("Workspace", "Workspace")
env.Workspace = env.workspace
env.Vector3, env.CFrame, env.Color3, env.Enum = Vector3, CFrame, Color3, Enum
env.Instance = { new = function(c) return newObject(c) end }
env.task = { wait = noop, spawn = function(f) return f end, delay = noop, defer = noop, cancel = noop }
env.wait, env.spawn, env.delay = noop, noop, noop
env.tick = function() return os.clock() end
env.time = function() return os.clock() end
env.loadstring = function() return function() return ui() end end

-- `require(...)` returns a table of tables of functions
-- (e.g. FlowClient.PlayerDamage.TakeDamage).
env.require = function()
  local sub = setmetatable({}, { __index = function() return noop end })
  return setmetatable({}, { __index = function(_, k) sub[k] = sub; return sub end })
end

-- Roblox/Luau still exposes getfenv/setfenv; MoonSec-style preludes use them.
env.getfenv = function() return env end
env.setfenv = function(f, t) if type(f) == "function" and t then setfenv(f, t) end return f end
env.getgenv = function() return env end
env.getrenv = function() return env end
env.request = function() return { Body = "{}", Success = true } end
env.fireproximityprompt = noop
env.firetouchinterest = noop
env.setreadonly, env.setfpscap, env.hookfunction = noop, noop, noop
env.writefile, env.checkcaller = noop, noop
env.getfpscap = function() return 60 end
env.isfile = function() return false end
env.readfile = function() return "" end

for _, k in ipairs({ "pcall", "xpcall", "select", "setmetatable", "getmetatable", "rawget",
                      "rawset", "rawequal", "rawlen", "next", "pairs", "ipairs", "tostring",
                      "tonumber", "unpack", "type", "table", "string", "math", "os",
                      "coroutine", "assert", "collectgarbage", "print", "error" }) do
  env[k] = _G[k]
end

-- Luau-only helpers that Roblox exposes but stock Lua 5.1 does not.
table.clear = function(t) for k in pairs(t) do t[k] = nil end return t end

------------------------------------------------------------------------------ run
local chunk, err = loadfile(path)
if not chunk then
  io.stderr:write("LOAD ERROR: " .. tostring(err) .. "\n")
  os.exit(2)
end
setfenv(chunk, env)
local ok, runErr = pcall(chunk)
if not ok then
  io.stderr:write("RUNTIME ERROR: " .. tostring(runErr) .. "\n")
  os.exit(1)
end
print(string.format("RAN OK (top level completed; %d callbacks, %d signals registered)",
                    #DRIVEN.callbacks, #DRIVEN.signals))

if arg[2] == "drive" then
  local errors = 0

  -- Guard against harness-induced infinite loops (`while part.Parent do` never
  -- ends when the stub always returns a child). Aborts the single callback
  -- rather than the whole run.
  local BUDGET = tonumber(os.getenv("HOOK_BUDGET") or "3000")

  local function attempt(label, fn)
    local steps = 0
    debug.sethook(function()
      steps = steps + 1
      if steps > BUDGET then
        -- Dump the interrupted frames so a spin can be located in VM state.
        for lvl = 2, 5 do
          local info = debug.getinfo(lvl, "nSl")
          if not info then break end
          local bits = {}
          for i = 1, 12 do
            local nm, val = debug.getlocal(lvl, i)
            if not nm then break end
            if type(val) == "number" or type(val) == "string" then
              bits[#bits + 1] = nm .. "=" .. tostring(val)
            elseif type(val) == "table" then
              bits[#bits + 1] = nm .. "=table"
            end
          end
          io.stderr:write(string.format("  frame %d %s:%s %s\n", lvl,
            tostring(info.short_src), tostring(info.currentline),
            table.concat(bits, " ")))
        end
        error("instruction budget exceeded", 0)
      end
    end, "", 10000)
    local ok2, e = xpcall(fn, function(msg)
      return tostring(msg) .. "\n" .. debug.traceback("", 2)
    end)
    debug.sethook()
    if not ok2 then
      errors = errors + 1
      io.stderr:write(string.format("DRIVEN ERROR [%s]: %s\n", label, tostring(e)))
    else
      io.stderr:write(string.format("  ok [%s] (%d steps)\n", label, steps))
    end
  end

  for i, spec in ipairs(DRIVEN.callbacks) do
    local title = tostring(spec.Title or spec.Name or ("callback#" .. i))
    local v = spec.Value
    if v == nil and spec.Sliders then v = spec.Sliders[1] and spec.Sliders[1].StarterValue end
    if v == nil then v = spec.StarterValue end
    if v == nil then v = spec.StarterOption end
    if v == nil then v = true end
    io.stderr:write("  .. " .. title .. "\n")
    attempt(title .. "(enable)", function() return spec.CallBack(v) end)
    if v ~= true then attempt(title .. "(off)", function() return spec.CallBack(false) end) end
  end

  for round = 1, 3 do
    for i, fn in ipairs(DRIVEN.signals) do
      attempt("signal#" .. i .. "/round" .. round, function() return fn(0.1) end)
    end
  end

  print(string.format("DRIVEN OK (%d callbacks, %d signals, %d errors)",
                      #DRIVEN.callbacks, #DRIVEN.signals, errors))
  if errors > 0 then os.exit(1) end
end
