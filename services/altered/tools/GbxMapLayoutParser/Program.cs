using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using GBX.NET;
using GBX.NET.Engines.Game;
using GBX.NET.LZO;

if (args.Length < 2)
{
    Console.Error.WriteLine("Usage: GbxMapLayoutParser <request.json> <response.json>");
    return 1;
}

var requestPath = args[0];
var responsePath = args[1];

var jsonOptions = new JsonSerializerOptions
{
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    WriteIndented = false,
};
var blockFootprints = new Lazy<IReadOnlyDictionary<string, BlockFootprint>>(LoadBlockFootprints);
const int BlockVariantIndexMask = 0x0FE00000;
const int MobilVariantIndexMask = 0x00000FC0;
const int MobilIndexMask = 0x0000003F;
const int WeightedPlacementBlockWeight = 1;
const int WeightedPlacementItemWeight = 4;

RequestPayload? request;
await using (var requestStream = File.OpenRead(requestPath))
{
    request = await JsonSerializer.DeserializeAsync<RequestPayload>(requestStream, jsonOptions);
}

if (request is null)
{
    Console.Error.WriteLine("Could not deserialize parser request payload.");
    return 1;
}

Gbx.LZO ??= new Lzo();

var response = new ResponsePayload
{
    Ok = true,
    ParserVersion = ParserInfo.Version,
};

foreach (var map in request.Maps ?? [])
{
    if (string.IsNullOrWhiteSpace(map?.MapUid) || string.IsNullOrWhiteSpace(map?.FilePath))
    {
        response.Maps.Add(new MapParseResult
        {
            MapUid = map?.MapUid ?? "",
            Error = "mapUid and filePath are required.",
        });
        continue;
    }

    try
    {
        var challenge = Gbx.ParseNode<CGameCtnChallenge>(map.FilePath);
        response.Maps.Add(BuildMapResult(map.MapUid, challenge));
    }
    catch (Exception ex)
    {
        response.Maps.Add(new MapParseResult
        {
            MapUid = map.MapUid,
            Error = ex.Message,
        });
    }
}

await using (var responseStream = File.Create(responsePath))
{
    await JsonSerializer.SerializeAsync(responseStream, response, jsonOptions);
}

return response.Maps.Any(item => !string.IsNullOrWhiteSpace(item.Error)) ? 2 : 0;

MapParseResult BuildMapResult(string mapUid, CGameCtnChallenge challenge)
{
    var modelCounts = new Dictionary<string, int>(StringComparer.Ordinal);
    var absoluteSketch = new HashSet<string>(StringComparer.Ordinal);
    var relativeSketch = new HashSet<string>(StringComparer.Ordinal);
    var weightedAbsoluteCounts = new Dictionary<string, int>(StringComparer.Ordinal);
    var weightedRelativeCounts = new Dictionary<string, int>(StringComparer.Ordinal);
    var elements = new List<ParsedElement>();

    var blocks = challenge.Blocks ?? [];
    var items = challenge.AnchoredObjects ?? [];

    var minBlockX = blocks.Count > 0 ? blocks.Min(block => block.Coord.X) : 0;
    var minBlockY = blocks.Count > 0 ? blocks.Min(block => block.Coord.Y) : 0;
    var minBlockZ = blocks.Count > 0 ? blocks.Min(block => block.Coord.Z) : 0;

    var minItemX = items.Count > 0 ? items.Min(item => item.BlockUnitCoord.X) : 0;
    var minItemY = items.Count > 0 ? items.Min(item => item.BlockUnitCoord.Y) : 0;
    var minItemZ = items.Count > 0 ? items.Min(item => item.BlockUnitCoord.Z) : 0;
    var scannedBlocks = new List<ScannedBlock>(blocks.Count);
    var occupancy = new Dictionary<(int X, int Y, int Z), List<int>>();

    for (var index = 0; index < blocks.Count; index += 1)
    {
        var block = blocks[index];
        var typeId = NormalizeTypeId(ResolveBlockModel(block));
        var baseVariant = BuildBaseBlockMeshVariant(block);
        var footprintCells = block.IsFree
            ? []
            : EnumerateOccupiedFootprintCells(block.Coord.X, block.Coord.Y, block.Coord.Z, block.Direction, typeId);

        scannedBlocks.Add(new ScannedBlock
        {
            Index = index,
            Block = block,
            RawId = ResolveBlockModel(block),
            TypeId = typeId,
            BaseVariant = baseVariant,
            FootprintCells = footprintCells,
        });

        foreach (var cell in footprintCells)
        {
            if (!occupancy.TryGetValue(cell, out var list))
            {
                list = [];
                occupancy[cell] = list;
            }

            list.Add(index);
        }
    }

    for (var index = 0; index < blocks.Count; index += 1)
    {
        var block = blocks[index];
        var scannedBlock = scannedBlocks[index];
        var modelToken = $"block:{scannedBlock.RawId}";
        var typeId = scannedBlock.TypeId;
        var blockMeshVariant = BuildBlockMeshVariant(scannedBlock, occupancy);
        AddToken(modelCounts, modelToken);

        var absoluteToken =
            $"b|{modelToken}|c:{block.Coord.X},{block.Coord.Y},{block.Coord.Z}|d:{block.Direction}|v:{block.Variant}|sv:{block.SubVariant}|g:{BoolToken(block.IsGround)}|f:{BoolToken(block.IsFree)}";
        var relativeToken =
            $"b|{modelToken}|r:{block.Coord.X - minBlockX},{block.Coord.Y - minBlockY},{block.Coord.Z - minBlockZ}|d:{block.Direction}|v:{block.Variant}|sv:{block.SubVariant}|g:{BoolToken(block.IsGround)}|f:{BoolToken(block.IsFree)}";

        var absoluteHash = HashToken(absoluteToken);
        var relativeHash = HashToken(relativeToken);
        absoluteSketch.Add(absoluteHash);
        relativeSketch.Add(relativeHash);
        if (!block.IsPillar)
        {
            AddWeightedToken(weightedAbsoluteCounts, absoluteHash, WeightedPlacementBlockWeight);
            AddWeightedToken(weightedRelativeCounts, relativeHash, WeightedPlacementBlockWeight);
        }

        var position = block.IsFree && block.AbsolutePositionInMap.HasValue
            ? ToVector(block.AbsolutePositionInMap.Value)
            : ToBlockAnchorPosition(block.Coord.X, block.Coord.Y, block.Coord.Z, block.Direction, typeId);
        var pitchYawRoll = block.IsFree && block.YawPitchRoll.HasValue
            ? ToPitchYawRoll(block.YawPitchRoll.Value)
            : new ParsedVec3
            {
                X = 0,
                Y = ToYawFromDirection(block.Direction),
                Z = 0,
            };
        var metadata = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["rawId"] = scannedBlock.RawId,
            ["coordX"] = block.Coord.X.ToString(CultureInfo.InvariantCulture),
            ["coordY"] = block.Coord.Y.ToString(CultureInfo.InvariantCulture),
            ["coordZ"] = block.Coord.Z.ToString(CultureInfo.InvariantCulture),
            ["direction"] = block.Direction.ToString(),
            ["variant"] = block.Variant.ToString(CultureInfo.InvariantCulture),
            ["subVariant"] = block.SubVariant.ToString(CultureInfo.InvariantCulture),
            ["isGround"] = block.IsGround.ToString(),
            ["isFree"] = block.IsFree.ToString(),
            ["isClip"] = block.IsClip.ToString(),
            ["isPillar"] = block.IsPillar.ToString(),
            ["blockVariantIndex"] = blockMeshVariant.BlockVariantIndex.ToString(CultureInfo.InvariantCulture),
            ["mobilIndex"] = blockMeshVariant.MobilIndex.ToString(CultureInfo.InvariantCulture),
            ["mobilVariantIndex"] = blockMeshVariant.MobilVariantIndex.ToString(CultureInfo.InvariantCulture),
            ["connectionSignature"] = blockMeshVariant.ConnectionSignature,
        };
        if (block.AbsolutePositionInMap.HasValue)
        {
            metadata["absoluteX"] = FormatFloat(block.AbsolutePositionInMap.Value.X);
            metadata["absoluteY"] = FormatFloat(block.AbsolutePositionInMap.Value.Y);
            metadata["absoluteZ"] = FormatFloat(block.AbsolutePositionInMap.Value.Z);
        }
        if (block.YawPitchRoll.HasValue)
        {
            metadata["yaw"] = FormatFloat(block.YawPitchRoll.Value.X);
            metadata["pitch"] = FormatFloat(block.YawPitchRoll.Value.Y);
            metadata["roll"] = FormatFloat(block.YawPitchRoll.Value.Z);
        }

        elements.Add(new ParsedElement
        {
            InstanceId = $"block:{index}",
            TypeId = typeId,
            MeshVariantKey = blockMeshVariant.MeshVariantKey,
            Variant = block.Variant,
            SubVariant = block.SubVariant,
            IsGround = block.IsGround,
            BlockVariantIndex = blockMeshVariant.BlockVariantIndex,
            MobilIndex = blockMeshVariant.MobilIndex,
            MobilVariantIndex = blockMeshVariant.MobilVariantIndex,
            Kind = "Block",
            Transform = new ParsedTransform
            {
                Position = position,
                PitchYawRoll = pitchYawRoll,
            },
            WaypointKind = DetectWaypointKind(typeId),
            Metadata = metadata,
        });
    }

    for (var index = 0; index < items.Count; index += 1)
    {
        var item = items[index];
        var modelToken = $"item:{ResolveItemModel(item)}";
        var typeId = NormalizeTypeId(ResolveItemModel(item));
        AddToken(modelCounts, modelToken);

        var absoluteToken =
            $"i|{modelToken}|u:{item.BlockUnitCoord.X},{item.BlockUnitCoord.Y},{item.BlockUnitCoord.Z}|p:{FormatVec3(item.AbsolutePositionInMap)}|r:{FormatVec3(item.YawPitchRoll)}|s:{FormatFloat(item.Scale)}";
        var relativeToken =
            $"i|{modelToken}|r:{item.BlockUnitCoord.X - minItemX},{item.BlockUnitCoord.Y - minItemY},{item.BlockUnitCoord.Z - minItemZ}|pr:{FormatRelativePosition(item.AbsolutePositionInMap, items, axis: 'x')},{FormatRelativePosition(item.AbsolutePositionInMap, items, axis: 'y')},{FormatRelativePosition(item.AbsolutePositionInMap, items, axis: 'z')}|rot:{FormatVec3(item.YawPitchRoll)}|s:{FormatFloat(item.Scale)}";

        var absoluteHash = HashToken(absoluteToken);
        var relativeHash = HashToken(relativeToken);
        absoluteSketch.Add(absoluteHash);
        relativeSketch.Add(relativeHash);
        AddWeightedToken(weightedAbsoluteCounts, absoluteHash, WeightedPlacementItemWeight);
        AddWeightedToken(weightedRelativeCounts, relativeHash, WeightedPlacementItemWeight);

        elements.Add(new ParsedElement
        {
            InstanceId = $"item:{index}",
            TypeId = typeId,
            MeshVariantKey = string.Empty,
            Kind = "Item",
            Transform = new ParsedTransform
            {
                Position = ToVector(item.AbsolutePositionInMap),
                PitchYawRoll = ToPitchYawRoll(item.YawPitchRoll),
            },
            WaypointKind = DetectWaypointKind(typeId),
            Metadata = new Dictionary<string, string>(StringComparer.Ordinal)
            {
                ["rawId"] = ResolveItemModel(item),
                ["blockUnitX"] = item.BlockUnitCoord.X.ToString(CultureInfo.InvariantCulture),
                ["blockUnitY"] = item.BlockUnitCoord.Y.ToString(CultureInfo.InvariantCulture),
                ["blockUnitZ"] = item.BlockUnitCoord.Z.ToString(CultureInfo.InvariantCulture),
                ["absoluteX"] = FormatFloat(item.AbsolutePositionInMap.X),
                ["absoluteY"] = FormatFloat(item.AbsolutePositionInMap.Y),
                ["absoluteZ"] = FormatFloat(item.AbsolutePositionInMap.Z),
                ["yaw"] = FormatFloat(item.YawPitchRoll.X),
                ["pitch"] = FormatFloat(item.YawPitchRoll.Y),
                ["roll"] = FormatFloat(item.YawPitchRoll.Z),
                ["scale"] = FormatFloat(item.Scale),
            },
        });
    }

    return new MapParseResult
    {
        MapUid = mapUid,
        MapName = challenge.MapName,
        Elements = elements,
        Signature = new LayoutSignature
        {
            Version = ParserInfo.Version,
            BlockCount = blocks.Count,
            AnchoredObjectCount = items.Count,
            Groups = new Dictionary<string, List<TokenCount>>(StringComparer.Ordinal)
            {
                ["modelTokens"] = ToTokenCounts(modelCounts),
                ["absolutePlacementTokens"] = ToSketchTokenCounts(absoluteSketch),
                ["relativePlacementTokens"] = ToSketchTokenCounts(relativeSketch),
                ["weightedAbsolutePlacementTokens"] = ToTokenCounts(weightedAbsoluteCounts),
                ["weightedRelativePlacementTokens"] = ToTokenCounts(weightedRelativeCounts),
            },
        },
    };
}

static string ResolveBlockModel(CGameCtnBlock block)
{
    var modelId = block.BlockModel?.Id;
    if (!string.IsNullOrWhiteSpace(modelId)) return modelId;
    if (!string.IsNullOrWhiteSpace(block.Name)) return block.Name;
    return "unknown";
}

static string ResolveItemModel(CGameCtnAnchoredObject item)
{
    var modelId = item.ItemModel?.Id;
    if (!string.IsNullOrWhiteSpace(modelId)) return modelId;
    if (!string.IsNullOrWhiteSpace(item.AnchorTreeId)) return item.AnchorTreeId;
    return "unknown";
}

static string NormalizeTypeId(string rawId)
{
    if (string.IsNullOrWhiteSpace(rawId))
    {
        return "Unknown";
    }

    return rawId
        .Replace(".Block.Gbx_CustomBlock", string.Empty, StringComparison.OrdinalIgnoreCase)
        .Replace(".Block.Gbx", string.Empty, StringComparison.OrdinalIgnoreCase)
        .Replace(".Item.Gbx", string.Empty, StringComparison.OrdinalIgnoreCase)
        .Replace('/', '\\')
        .Trim();
}

static string DetectWaypointKind(string typeId)
{
    if (typeId.Contains("Checkpoint", StringComparison.OrdinalIgnoreCase)
        || typeId.Contains("GateCheckpoint", StringComparison.OrdinalIgnoreCase)
        || typeId.Contains("\\Checkpoints\\", StringComparison.OrdinalIgnoreCase)
        || typeId.Contains("/Checkpoints/", StringComparison.OrdinalIgnoreCase)
        || typeId.Contains("\\CP\\", StringComparison.OrdinalIgnoreCase)
        || typeId.Contains("/CP/", StringComparison.OrdinalIgnoreCase))
    {
        return "Checkpoint";
    }

    if (typeId.Contains("Finish", StringComparison.OrdinalIgnoreCase)
        || typeId.Contains("GateFinish", StringComparison.OrdinalIgnoreCase)
        || typeId.Contains("StartFin", StringComparison.OrdinalIgnoreCase)
        || typeId.Contains("StartFinish", StringComparison.OrdinalIgnoreCase))
    {
        return "Finish";
    }

    if (typeId.Contains("MapStart", StringComparison.OrdinalIgnoreCase)
        || typeId.Contains("GateStart", StringComparison.OrdinalIgnoreCase)
        || typeId.EndsWith("Start", StringComparison.OrdinalIgnoreCase)
        || typeId.Contains("LoopStart", StringComparison.OrdinalIgnoreCase)
        || typeId.Contains("LoopOutStart", StringComparison.OrdinalIgnoreCase)
        || typeId.Contains("Waypoints_Start", StringComparison.OrdinalIgnoreCase))
    {
        return "Start";
    }

    return "None";
}

static string BoolToken(bool value) => value ? "1" : "0";

static string FormatVec3(Vec3 vec) =>
    $"{FormatFloat(vec.X)},{FormatFloat(vec.Y)},{FormatFloat(vec.Z)}";

static string FormatFloat(float value) =>
    Math.Round(value, 3).ToString("0.###", CultureInfo.InvariantCulture);

static string FormatRelativePosition(Vec3 current, List<CGameCtnAnchoredObject> items, char axis)
{
    if (items.Count == 0) return "0";
    var min = axis switch
    {
        'x' => items.Min(item => item.AbsolutePositionInMap.X),
        'y' => items.Min(item => item.AbsolutePositionInMap.Y),
        _ => items.Min(item => item.AbsolutePositionInMap.Z),
    };
    var value = axis switch
    {
        'x' => current.X - min,
        'y' => current.Y - min,
        _ => current.Z - min,
    };
    return FormatFloat(value);
}

static double ToYawFromDirection(Direction direction)
{
    return direction switch
    {
        Direction.North => 0,
        Direction.East => Math.PI * 1.5,
        Direction.South => Math.PI,
        Direction.West => Math.PI * 0.5,
        _ => 0,
    };
}

ParsedVec3 ToBlockAnchorPosition(int coordX, int coordY, int coordZ, Direction direction, string typeId)
{
    var footprint = ResolveBlockFootprint(typeId);
    var x = coordX * 32.0;
    var y = (coordY * 8.0) - 64.0;
    var z = coordZ * 32.0;

    return direction switch
    {
        Direction.East => new ParsedVec3
        {
            X = x + (footprint.Length * 32.0),
            Y = y,
            Z = z,
        },
        Direction.South => new ParsedVec3
        {
            X = x + (footprint.Width * 32.0),
            Y = y,
            Z = z + (footprint.Length * 32.0),
        },
        Direction.West => new ParsedVec3
        {
            X = x,
            Y = y,
            Z = z + (footprint.Width * 32.0),
        },
        _ => new ParsedVec3
        {
            X = x,
            Y = y,
            Z = z,
        },
    };
}

BlockFootprint ResolveBlockFootprint(string typeId)
{
    if (blockFootprints.Value.TryGetValue(typeId, out var footprint))
    {
        return footprint;
    }

    return new BlockFootprint(Width: 1, Length: 1, Height: 1);
}

static IReadOnlyDictionary<string, BlockFootprint> LoadBlockFootprints()
{
    var dictionary = new Dictionary<string, BlockFootprint>(StringComparer.OrdinalIgnoreCase);
    foreach (var path in EnumerateBlockDataPaths())
    {
        try
        {
            using var stream = File.OpenRead(path);
            using var document = JsonDocument.Parse(stream);
            foreach (var element in document.RootElement.EnumerateArray())
            {
                if (!element.TryGetProperty("name", out var nameProperty))
                {
                    continue;
                }

                var rawName = nameProperty.GetString();
                if (string.IsNullOrWhiteSpace(rawName))
                {
                    continue;
                }

                var normalizedName = NormalizeTypeId(rawName);
                if (!element.TryGetProperty("size", out var sizeProperty))
                {
                    continue;
                }

                var width = sizeProperty.TryGetProperty("x", out var widthProperty) && widthProperty.TryGetInt32(out var widthValue)
                    ? Math.Max(widthValue, 1)
                    : 1;
                var length = sizeProperty.TryGetProperty("z", out var lengthProperty) && lengthProperty.TryGetInt32(out var lengthValue)
                    ? Math.Max(lengthValue, 1)
                    : 1;
                var height = sizeProperty.TryGetProperty("y", out var heightProperty) && heightProperty.TryGetInt32(out var heightValue)
                    ? Math.Max(heightValue, 1)
                    : 1;

                dictionary[normalizedName] = new BlockFootprint(width, length, height);
            }

            if (dictionary.Count > 0)
            {
                break;
            }
        }
        catch
        {
        }
    }

    return dictionary;
}

static IEnumerable<string> EnumerateBlockDataPaths()
{
    var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

    void AddPath(List<string> list, string? candidate)
    {
        if (string.IsNullOrWhiteSpace(candidate))
        {
            return;
        }

        var fullPath = Path.GetFullPath(candidate);
        if (seen.Add(fullPath))
        {
            list.Add(fullPath);
        }
    }

    var paths = new List<string>();
    foreach (var current in EnumerateAncestorDirectories(AppContext.BaseDirectory))
    {
        AddPath(paths, Path.Combine(current, "..", "autoalteration", "AutoAlteration", "data", "Inventory", "BlockData.json"));
        AddPath(paths, Path.Combine(current, "..", "autoalteration", "AutoAlteration-1", "data", "Inventory", "BlockData.json"));
        AddPath(paths, Path.Combine(current, "..", "..", "misc", "autoalteration", "AutoAlteration", "data", "Inventory", "BlockData.json"));
        AddPath(paths, Path.Combine(current, "..", "..", "misc", "autoalteration", "AutoAlteration-1", "data", "Inventory", "BlockData.json"));
        AddPath(paths, Path.Combine(current, "data", "Inventory", "BlockData.json"));
    }

    return paths.Where(File.Exists);
}

static IEnumerable<string> EnumerateAncestorDirectories(string startPath)
{
    var current = Directory.Exists(startPath)
        ? Path.GetFullPath(startPath)
        : Path.GetDirectoryName(Path.GetFullPath(startPath));

    while (!string.IsNullOrWhiteSpace(current))
    {
        yield return current;
        current = Path.GetDirectoryName(current);
    }
}

static ParsedVec3 ToPitchYawRoll(Vec3 yawPitchRoll) => new ParsedVec3
{
    X = yawPitchRoll.Y,
    Y = yawPitchRoll.X,
    Z = yawPitchRoll.Z,
};

static ParsedVec3 ToVector(Vec3 input) => new ParsedVec3
{
    X = input.X,
    Y = input.Y,
    Z = input.Z,
};

static string HashToken(string value)
{
    var hash = SHA256.HashData(Encoding.UTF8.GetBytes(value));
    return Convert.ToHexString(hash[..12]);
}

static void AddToken(IDictionary<string, int> counts, string token)
{
    if (string.IsNullOrWhiteSpace(token)) return;
    counts[token] = counts.TryGetValue(token, out var count) ? count + 1 : 1;
}

static void AddWeightedToken(IDictionary<string, int> counts, string token, int weight)
{
    if (string.IsNullOrWhiteSpace(token) || weight <= 0) return;
    counts[token] = counts.TryGetValue(token, out var count) ? count + weight : weight;
}

static List<TokenCount> ToTokenCounts(Dictionary<string, int> counts) =>
    counts
        .OrderByDescending(item => item.Value)
        .ThenBy(item => item.Key, StringComparer.Ordinal)
        .Select(item => new TokenCount { Token = item.Key, Count = item.Value })
        .ToList();

static List<TokenCount> ToSketchTokenCounts(HashSet<string> tokens, int maxSize = 128) =>
    tokens
        .OrderBy(token => token, StringComparer.Ordinal)
        .Take(maxSize)
        .Select(token => new TokenCount { Token = token, Count = 1 })
        .ToList();

IReadOnlyList<(int X, int Y, int Z)> EnumerateOccupiedFootprintCells(
    int coordX,
    int coordY,
    int coordZ,
    Direction direction,
    string typeId)
{
    var footprint = ResolveBlockFootprint(typeId);
    var cells = new List<(int X, int Y, int Z)>(Math.Max(1, footprint.Width * footprint.Length));
    for (var localX = 0; localX < footprint.Width; localX += 1)
    {
        for (var localZ = 0; localZ < footprint.Length; localZ += 1)
        {
            cells.Add(RotateFootprintCell(coordX, coordY, coordZ, localX, localZ, footprint, direction));
        }
    }

    return cells;
}

static (int X, int Y, int Z) RotateFootprintCell(
    int coordX,
    int coordY,
    int coordZ,
    int localX,
    int localZ,
    BlockFootprint footprint,
    Direction direction)
{
    return direction switch
    {
        Direction.East => (coordX + ((footprint.Length - 1) - localZ), coordY, coordZ + localX),
        Direction.South => (coordX + ((footprint.Width - 1) - localX), coordY, coordZ + ((footprint.Length - 1) - localZ)),
        Direction.West => (coordX + localZ, coordY, coordZ + ((footprint.Width - 1) - localX)),
        _ => (coordX + localX, coordY, coordZ + localZ),
    };
}

static BaseBlockMeshVariant BuildBaseBlockMeshVariant(CGameCtnBlock block)
{
    var flags = block.Flags;
    return new BaseBlockMeshVariant(
        Variant: block.Variant,
        SubVariant: block.SubVariant,
        IsGround: block.IsGround,
        BlockVariantIndex: DecodeBlockVariantIndex(flags),
        MobilIndex: DecodeMobilIndex(flags),
        MobilVariantIndex: DecodeMobilVariantIndex(flags));
}

static BlockMeshVariant BuildBlockMeshVariant(
    ScannedBlock scannedBlock,
    IReadOnlyDictionary<(int X, int Y, int Z), List<int>> occupancy)
{
    var block = scannedBlock.Block;
    var baseVariant = scannedBlock.BaseVariant;
    var connectionSignature = BuildClipConnectionSignature(scannedBlock, occupancy);
    var key = string.Create(
        CultureInfo.InvariantCulture,
        $"v{baseVariant.Variant};sv{baseVariant.SubVariant};g{(baseVariant.IsGround ? 1 : 0)};c{(block.IsClip ? 1 : 0)};p{(block.IsPillar ? 1 : 0)};bvi{baseVariant.BlockVariantIndex};mi{baseVariant.MobilIndex};mvi{baseVariant.MobilVariantIndex};cc{connectionSignature}");
    return new BlockMeshVariant(
        MeshVariantKey: key,
        Variant: baseVariant.Variant,
        SubVariant: baseVariant.SubVariant,
        IsGround: baseVariant.IsGround,
        BlockVariantIndex: baseVariant.BlockVariantIndex,
        MobilIndex: baseVariant.MobilIndex,
        MobilVariantIndex: baseVariant.MobilVariantIndex,
        ConnectionSignature: connectionSignature);
}

static string BuildClipConnectionSignature(
    ScannedBlock scannedBlock,
    IReadOnlyDictionary<(int X, int Y, int Z), List<int>> occupancy)
{
    if (scannedBlock.Block.IsFree || !ShouldTrackConnections(scannedBlock.TypeId, scannedBlock.Block.IsPillar))
    {
        return "none";
    }

    var hasNorth = HasNeighbor(scannedBlock, occupancy, 0, 0, -1);
    var hasEast = HasNeighbor(scannedBlock, occupancy, 1, 0, 0);
    var hasSouth = HasNeighbor(scannedBlock, occupancy, 0, 0, 1);
    var hasWest = HasNeighbor(scannedBlock, occupancy, -1, 0, 0);
    var hasUp = HasNeighbor(scannedBlock, occupancy, 0, 1, 0);
    var hasDown = HasNeighbor(scannedBlock, occupancy, 0, -1, 0);

    return string.Create(
        CultureInfo.InvariantCulture,
        $"n{(hasNorth ? 1 : 0)}e{(hasEast ? 1 : 0)}s{(hasSouth ? 1 : 0)}w{(hasWest ? 1 : 0)}u{(hasUp ? 1 : 0)}d{(hasDown ? 1 : 0)}");
}

static bool HasNeighbor(
    ScannedBlock scannedBlock,
    IReadOnlyDictionary<(int X, int Y, int Z), List<int>> occupancy,
    int dx,
    int dy,
    int dz)
{
    foreach (var cell in scannedBlock.FootprintCells)
    {
        var neighborCell = (cell.X + dx, cell.Y + dy, cell.Z + dz);
        if (!occupancy.TryGetValue(neighborCell, out var neighborIndexes))
        {
            continue;
        }

        if (neighborIndexes.Any(index => index != scannedBlock.Index))
        {
            return true;
        }
    }

    return false;
}

static bool ShouldTrackConnections(string typeId, bool isPillar)
{
    return isPillar
        || typeId.Contains("Wall", StringComparison.OrdinalIgnoreCase)
        || typeId.StartsWith("Open", StringComparison.OrdinalIgnoreCase);
}

static int DecodeBlockVariantIndex(int flags) => (flags & BlockVariantIndexMask) >> 21;
static int DecodeMobilVariantIndex(int flags) => (flags & MobilVariantIndexMask) >> 6;
static int DecodeMobilIndex(int flags) => flags & MobilIndexMask;

sealed class RequestPayload
{
    public List<MapRequest> Maps { get; init; } = [];
}

sealed class MapRequest
{
    public string MapUid { get; init; } = "";
    public string FilePath { get; init; } = "";
}

sealed class ResponsePayload
{
    public bool Ok { get; init; }
    public string ParserVersion { get; init; } = ParserInfo.Version;
    public List<MapParseResult> Maps { get; init; } = [];
}

sealed class MapParseResult
{
    public string MapUid { get; init; } = "";
    public string? MapName { get; init; }
    public List<ParsedElement> Elements { get; init; } = [];
    public LayoutSignature? Signature { get; init; }
    public string? Error { get; init; }
}

sealed class LayoutSignature
{
    public string Version { get; init; } = ParserInfo.Version;
    public int BlockCount { get; init; }
    public int AnchoredObjectCount { get; init; }
    public Dictionary<string, List<TokenCount>> Groups { get; init; } = new(StringComparer.Ordinal);
}

sealed class TokenCount
{
    public string Token { get; init; } = "";
    public int Count { get; init; }
}

sealed class ParsedElement
{
    public string InstanceId { get; init; } = "";
    public string TypeId { get; init; } = "";
    public string MeshVariantKey { get; init; } = "";
    public int? Variant { get; init; }
    public int? SubVariant { get; init; }
    public bool? IsGround { get; init; }
    public int? BlockVariantIndex { get; init; }
    public int? MobilIndex { get; init; }
    public int? MobilVariantIndex { get; init; }
    public string Kind { get; init; } = "";
    public ParsedTransform Transform { get; init; } = new();
    public string WaypointKind { get; init; } = "None";
    public Dictionary<string, string> Metadata { get; init; } = new(StringComparer.Ordinal);
}

sealed class ParsedTransform
{
    public ParsedVec3 Position { get; init; } = new();
    public ParsedVec3 PitchYawRoll { get; init; } = new();
}

sealed class ParsedVec3
{
    public double X { get; init; }
    public double Y { get; init; }
    public double Z { get; init; }
}

sealed record BlockFootprint(int Width, int Length, int Height);
sealed record BaseBlockMeshVariant(
    int Variant,
    int SubVariant,
    bool IsGround,
    int BlockVariantIndex,
    int MobilIndex,
    int MobilVariantIndex);
sealed record BlockMeshVariant(
    string MeshVariantKey,
    int Variant,
    int SubVariant,
    bool IsGround,
    int BlockVariantIndex,
    int MobilIndex,
    int MobilVariantIndex,
    string ConnectionSignature);
sealed class ScannedBlock
{
    public required int Index { get; init; }
    public required CGameCtnBlock Block { get; init; }
    public required string RawId { get; init; }
    public required string TypeId { get; init; }
    public required BaseBlockMeshVariant BaseVariant { get; init; }
    public required IReadOnlyList<(int X, int Y, int Z)> FootprintCells { get; init; }
}

static class ParserInfo
{
    public const string Version = "gbx-layout-v2";
}
