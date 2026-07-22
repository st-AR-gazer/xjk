import { mapErrorToResponse, sendSuccess } from "../httpResponses.js";
import { validateLookupValue, validateNullableRank } from "../requestValidation.js";
import { storeArtifactUpload } from "../uploadService.js";
import { bundleFromSubmission } from "../verificationModel.js";

export function registerSubmissionRoutes(
  app,
  {
    artifactLifecycle,
    artifactRoot,
    internalClient,
    logger = console,
    mapUploadMaxBytes,
    replayUploadMaxBytes,
    repository,
    uploadQuota,
  } = {}
) {
  async function handleUpload(req, res, { kind, maxBytes }) {
    try {
      const upload = await storeArtifactUpload({
        req,
        kind,
        filename: req.query.filename,
        maxBytes,
        artifactRoot,
        repository,
        uploadQuota,
      });
      return sendSuccess(res, upload);
    } catch (error) {
      logger.error(`[validifier-public] ${kind} upload failed:`, error?.message || error);
      return mapErrorToResponse(res, error, `The ${kind} upload could not be accepted.`);
    }
  }

  app.post("/api/v1/uploads/map", (req, res) => handleUpload(req, res, { kind: "map", maxBytes: mapUploadMaxBytes }));
  app.post("/api/v1/uploads/replay", (req, res) =>
    handleUpload(req, res, { kind: "replay", maxBytes: replayUploadMaxBytes })
  );

  app.post("/api/v1/submissions/replay", async (req, res) => {
    try {
      const recordId = validateLookupValue(req.body?.record_id, "record_id");
      const mapUid = validateLookupValue(req.body?.map_uid, "map_uid");
      const rank = validateNullableRank(req.body?.rank);
      const validateExeVersion = String(req.body?.validate_exe_version || "").trim();
      const mapArtifact = artifactLifecycle.requireArtifact(req.body?.map_ref, "map", "map_ref");
      const replayArtifact = artifactLifecycle.requireArtifact(req.body?.replay_ref, "replay", "replay_ref");
      repository.touchArtifacts([mapArtifact.artifact_ref, replayArtifact.artifact_ref]);
      const submissionId = repository.nextSubmissionId();
      const privateResponse = await internalClient.submitReplayMultipart({
        recordId,
        mapUid,
        rank,
        submissionId,
        submissionSource: "validifier.xjk.yt",
        mapPath: mapArtifact.storage_path,
        mapFilename: mapArtifact.original_filename,
        replayPath: replayArtifact.storage_path,
        replayFilename: replayArtifact.original_filename,
        validateExeVersion,
      });
      const submission = repository.createReplaySubmission({
        submissionId,
        recordId,
        mapUid,
        rank,
        mapRef: mapArtifact.artifact_ref,
        replayRef: replayArtifact.artifact_ref,
        privateJobId: String(privateResponse?.job_id || "").trim() || null,
      });
      return sendSuccess(res, {
        submission_id: submission.submission_id,
        record: bundleFromSubmission(submission, "all"),
      });
    } catch (error) {
      logger.error("[validifier-public] replay submission failed:", error?.message || error);
      return mapErrorToResponse(
        res,
        error,
        "The replay submission could not be accepted by the public Validifier service."
      );
    }
  });
}
