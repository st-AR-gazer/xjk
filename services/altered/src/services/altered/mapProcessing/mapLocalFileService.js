import { extractGbxContentSignature, parseGbxMapLayouts } from "../serviceSupport.js";
import { MapContentSignatureService } from "./mapContentSignatureService.js";
import { MapLocalFileInventoryService, createMapCopyState } from "./mapLocalFileInventoryService.js";
import { MapLocalFixImportService } from "./mapLocalFixImportService.js";
import { MapViewerDiffService } from "./mapViewerDiffService.js";

const operationsByService = new WeakMap();

function getOperations(service) {
  return operationsByService.get(service);
}

class MapLocalFileService {
  constructor({
    repository,
    mapCopyConfig = {},
    logger = console,
    getMapNameWorkspaceService,
    parseMapLayouts = parseGbxMapLayouts,
    extractContentSignature = extractGbxContentSignature,
  }) {
    this.repository = repository;
    this.logger = logger;
    this.getMapNameWorkspaceService = getMapNameWorkspaceService;
    this.parseMapLayouts = parseMapLayouts;
    this.extractContentSignature = extractContentSignature;
    this.mapCopy = createMapCopyState(mapCopyConfig);

    const inventory = new MapLocalFileInventoryService({
      repository,
      mapCopy: this.mapCopy,
      logger,
      getMapNameWorkspaceService: () => this.getMapNameWorkspaceService(),
      resolveLocalMapPath: (...args) => this.getLocalMapFileAbsolutePath(...args),
      loadBackfillMaps: (...args) => this.buildMapsForLocalCopyBackfill(...args),
      updateProgress: (...args) => this.updateMapCopyProgress(...args),
      readStoreStatus: (...args) => this.getMapLocalStoreStatus(...args),
      startBackfill: (...args) => this.runMapLocalCopyBackfill(...args),
      downloadMap: (...args) => this.downloadMapFileBuffer(...args),
    });
    const contentSignatures = new MapContentSignatureService({
      repository,
      logger,
      ensureMapLocalFiles: (...args) => this.ensureMapLocalFiles(...args),
      getPreferredMapLocalFiles: (...args) => this.getPreferredMapLocalFiles(...args),
      getLocalMapFileAbsolutePath: (...args) => this.getLocalMapFileAbsolutePath(...args),
      parseMapLayouts: (...args) => this.parseMapLayouts(...args),
      extractContentSignature: (...args) => this.extractContentSignature(...args),
    });
    const viewerDiff = new MapViewerDiffService({
      repository,
      getPreferredMapLocalFiles: (...args) => this.getPreferredMapLocalFiles(...args),
      getLocalMapFileAbsolutePath: (...args) => this.getLocalMapFileAbsolutePath(...args),
      parseMapLayouts: (...args) => this.parseMapLayouts(...args),
    });
    const localFixImport = new MapLocalFixImportService({
      repository,
      getMapNameWorkspaceService: () => this.getMapNameWorkspaceService(),
      getLocalMapFileAbsolutePath: (...args) => this.getLocalMapFileAbsolutePath(...args),
      ensureMapContentSignatures: (...args) => this.ensureMapContentSignatures(...args),
    });
    operationsByService.set(this, { inventory, contentSignatures, viewerDiff, localFixImport });
  }

  getLocalMapFileAbsolutePath(mapUid, relativePath = "") {
    return getOperations(this).inventory.getLocalMapFileAbsolutePath(mapUid, relativePath);
  }

  getMapLocalFixAbsolutePath(mapUid, sourceFilePath = "") {
    return getOperations(this).inventory.getMapLocalFixAbsolutePath(mapUid, sourceFilePath);
  }

  getPreferredMapLocalFiles(options = {}) {
    return getOperations(this).inventory.getPreferredMapLocalFiles(options);
  }

  getMapLocalStoreStatus() {
    return getOperations(this).inventory.getMapLocalStoreStatus();
  }

  updateMapCopyProgress(partial = {}) {
    return getOperations(this).inventory.updateMapCopyProgress(partial);
  }

  buildMapsForLocalCopyBackfill(options = {}) {
    return getOperations(this).inventory.buildMapsForLocalCopyBackfill(options);
  }

  runMapLocalCopyBackfill(options = {}) {
    return getOperations(this).inventory.runMapLocalCopyBackfill(options);
  }

  startMapLocalCopyBackfillOnBoot() {
    return getOperations(this).inventory.startMapLocalCopyBackfillOnBoot();
  }

  ensureMapLocalFiles(maps = [], options = {}) {
    return getOperations(this).inventory.ensureMapLocalFiles(maps, options);
  }

  downloadMapFileBuffer(options = {}) {
    return getOperations(this).inventory.downloadMapFileBuffer(options);
  }

  ensureMapContentSignatures(maps = [], options = {}) {
    return getOperations(this).contentSignatures.ensureMapContentSignatures(maps, options);
  }

  getMapViewerDiffPayload(options = {}) {
    return getOperations(this).viewerDiff.getMapViewerDiffPayload(options);
  }

  importMapLocalFileFix(options = {}) {
    return getOperations(this).localFixImport.importMapLocalFileFix(options);
  }
}

export { MapLocalFileService };
