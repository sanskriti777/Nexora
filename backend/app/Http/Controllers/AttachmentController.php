<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Models\Attachment;
use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use App\Models\Workspace;
use App\Models\WorkspaceMember;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AttachmentController extends Controller
{
    /**
     * Dangerous file extensions that must never be allowed.
     */
    protected const BLOCKED_EXTENSIONS = [
        'php', 'phtml', 'phar', 'php3', 'php4', 'php5', 'php7', 'php8',
        'exe', 'bat', 'cmd', 'sh', 'bash', 'bin', 'com', 'vbs', 'msi', 'jar', 'py', 'pl', 'cgi',
    ];

    /**
     * Dangerous MIME types that must never be allowed.
     */
    protected const BLOCKED_MIME_TYPES = [
        'application/x-php', 'text/x-php', 'application/php',
        'application/x-executable', 'application/x-msdownload', 'application/exe',
        'application/x-sh', 'text/x-sh', 'text/x-shellscript',
        'application/x-bat', 'application/x-msdos-program',
    ];

    /**
     * List attachments for an authorized entity (Project or Task).
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $entityType = strtolower($request->query('attachable_type') ?? $request->query('entity_type') ?? '');
        $entityId = (int) ($request->query('attachable_id') ?? $request->query('entity_id') ?? 0);

        if (! in_array($entityType, ['project', 'task'], true) || ! $entityId) {
            return response()->json([
                'success' => false,
                'message' => 'Valid entity_type (project or task) and entity_id are required.',
            ], 422);
        }

        $entity = $this->resolveEntity($entityType, $entityId);
        if (! $entity) {
            return response()->json([
                'success' => false,
                'message' => ucfirst($entityType) . ' not found.',
            ], 404);
        }

        if (! $this->userCanAccessEntity($user, $entityType, $entity)) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized access to this resource.',
            ], 403);
        }

        $attachments = Attachment::where('entity_type', $entityType)
            ->where('entity_id', $entityId)
            ->with('user:id,name,email')
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json([
            'success' => true,
            'data' => $attachments,
        ]);
    }

    /**
     * Upload an attachment to a Project or Task within an authorized workspace.
     */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();

        $maxSizeKb = config('filesystems.max_file_size', 20480);

        $validated = $request->validate([
            'file' => ['required', 'file', "max:{$maxSizeKb}"],
            'attachable_type' => ['nullable', 'string', 'in:project,task'],
            'entity_type' => ['nullable', 'string', 'in:project,task'],
            'attachable_id' => ['nullable', 'integer'],
            'entity_id' => ['nullable', 'integer'],
        ]);

        $entityType = strtolower($validated['attachable_type'] ?? $validated['entity_type'] ?? '');
        $entityId = (int) ($validated['attachable_id'] ?? $validated['entity_id'] ?? 0);

        if (! in_array($entityType, ['project', 'task'], true) || ! $entityId) {
            return response()->json([
                'success' => false,
                'message' => 'Valid entity_type (project or task) and entity_id are required.',
            ], 422);
        }

        $entity = $this->resolveEntity($entityType, $entityId);
        if (! $entity) {
            return response()->json([
                'success' => false,
                'message' => ucfirst($entityType) . ' not found.',
            ], 404);
        }

        if (! $this->userCanAccessEntity($user, $entityType, $entity)) {
            return response()->json([
                'success' => false,
                'message' => 'You do not have permission to attach files to this resource.',
            ], 403);
        }

        $workspace = $this->resolveWorkspaceFromEntity($entityType, $entity);
        if (! $workspace) {
            return response()->json([
                'success' => false,
                'message' => 'Unable to determine workspace context.',
            ], 422);
        }

        $file = $request->file('file');
        $originalFilename = $file->getClientOriginalName();

        // 1. Sanitize filename against path traversal and malicious characters
        $sanitizedName = $this->sanitizeFilename($originalFilename);
        $extension = strtolower($file->getClientOriginalExtension());

        // 2. Reject blocked executable/script extensions (including double extensions)
        if (in_array($extension, self::BLOCKED_EXTENSIONS, true)) {
            return response()->json([
                'success' => false,
                'message' => "Uploading files with .{$extension} extension is prohibited for security reasons.",
                'errors' => [
                    'file' => ["Uploading files with .{$extension} extension is prohibited for security reasons."],
                ],
            ], 422);
        }

        $filenameParts = explode('.', strtolower($originalFilename));
        foreach ($filenameParts as $part) {
            if (in_array($part, self::BLOCKED_EXTENSIONS, true)) {
                return response()->json([
                    'success' => false,
                    'message' => 'Uploading files with executable extensions is prohibited for security reasons.',
                    'errors' => [
                        'file' => ['Uploading files with executable extensions is prohibited for security reasons.'],
                    ],
                ], 422);
            }
        }

        // 3. Reject blocked MIME types to prevent extension spoofing
        $clientMime = strtolower($file->getClientMimeType() ?: '');
        $detectedMime = strtolower($file->getMimeType() ?: '');
        if (in_array($clientMime, self::BLOCKED_MIME_TYPES, true) || in_array($detectedMime, self::BLOCKED_MIME_TYPES, true)) {
            return response()->json([
                'success' => false,
                'message' => 'Uploading executable or script files is prohibited for security reasons.',
                'errors' => [
                    'file' => ['Uploading executable or script files is prohibited for security reasons.'],
                ],
            ], 422);
        }

        // 4. Collision-safe storage path
        $safeStorageFilename = Str::uuid() . '_' . time() . ($extension ? '.' . $extension : '');
        $storageDir = 'attachments/' . $workspace->id;

        $storedPath = $file->storeAs($storageDir, $safeStorageFilename, 'local');

        if (! $storedPath) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to store uploaded file on filesystem.',
            ], 500);
        }

        // 5. Persist attachment metadata and activity log inside transaction
        $attachment = null;
        try {
            DB::transaction(function () use ($user, $workspace, $sanitizedName, $storedPath, $file, $entityType, $entity, &$attachment) {
                $attachment = Attachment::create([
                    'user_id' => $user->id,
                    'workspace_id' => $workspace->id,
                    'original_name' => $sanitizedName,
                    'storage_path' => $storedPath,
                    'mime_type' => $file->getClientMimeType() ?: $file->getMimeType() ?: 'application/octet-stream',
                    'file_size' => $file->getSize(),
                    'disk' => 'local',
                    'entity_type' => $entityType,
                    'entity_id' => $entity->id,
                ]);

                ActivityLog::create([
                    'user_id' => $user->id,
                    'workspace_id' => $workspace->id,
                    'action' => 'attachment_uploaded',
                    'entity_type' => ucfirst($entityType),
                    'entity_id' => $entity->id,
                    'details' => [
                        'attachment_id' => $attachment->id,
                        'original_name' => $attachment->original_name,
                        'file_size' => $attachment->file_size,
                        'mime_type' => $attachment->mime_type,
                    ],
                ]);
            });
        } catch (\Throwable $e) {
            // Clean up stored file if metadata transaction fails
            if (Storage::disk('local')->exists($storedPath)) {
                Storage::disk('local')->delete($storedPath);
            }
            throw $e;
        }

        $attachment->load('user:id,name,email');

        return response()->json([
            'success' => true,
            'message' => 'Attachment uploaded successfully.',
            'data' => $attachment,
        ], 201);
    }

    /**
     * Show attachment metadata.
     */
    public function show(Request $request, int $id): JsonResponse
    {
        $user = $request->user();

        $attachment = Attachment::with('user:id,name,email')->find($id);
        if (! $attachment) {
            return response()->json([
                'success' => false,
                'message' => 'Attachment not found.',
            ], 404);
        }

        if (! $this->userBelongsToWorkspace($user->id, $attachment->workspace_id)) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized access to this attachment.',
            ], 403);
        }

        return response()->json([
            'success' => true,
            'data' => $attachment,
        ]);
    }

    /**
     * Securely download an attachment verifying authorization and disk existence.
     */
    public function download(Request $request, int $id): StreamedResponse|JsonResponse
    {
        $user = $request->user();

        $attachment = Attachment::find($id);
        if (! $attachment) {
            return response()->json([
                'success' => false,
                'message' => 'Attachment not found.',
            ], 404);
        }

        // Workspace authorization check
        if (! $this->userBelongsToWorkspace($user->id, $attachment->workspace_id)) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized access to this file.',
            ], 403);
        }

        // Verify physical file exists on disk
        $disk = $attachment->disk ?: 'local';
        if (! Storage::disk($disk)->exists($attachment->storage_path)) {
            return response()->json([
                'success' => false,
                'message' => 'File not found on storage disk.',
            ], 404);
        }

        return Storage::disk($disk)->download(
            $attachment->storage_path,
            $attachment->original_name,
            ['Content-Type' => $attachment->mime_type]
        );
    }

    /**
     * Delete an attachment metadata and its physical file.
     */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $user = $request->user();

        $attachment = Attachment::find($id);
        if (! $attachment) {
            return response()->json([
                'success' => false,
                'message' => 'Attachment not found.',
            ], 404);
        }

        // Authorization check
        if (! $this->userCanDeleteAttachment($user, $attachment)) {
            return response()->json([
                'success' => false,
                'message' => 'You do not have permission to delete this attachment.',
            ], 403);
        }

        $storagePath = $attachment->storage_path;
        $disk = $attachment->disk ?: 'local';

        // 1. Delete DB metadata and record activity within a transaction
        DB::transaction(function () use ($user, $attachment) {
            ActivityLog::create([
                'user_id' => $user->id,
                'workspace_id' => $attachment->workspace_id,
                'action' => 'attachment_deleted',
                'entity_type' => ucfirst($attachment->entity_type),
                'entity_id' => $attachment->entity_id,
                'details' => [
                    'attachment_id' => $attachment->id,
                    'original_name' => $attachment->original_name,
                    'file_size' => $attachment->file_size,
                ],
            ]);

            $attachment->delete();
        });

        // 2. Delete physical file from storage disk only after successful metadata deletion
        if (Storage::disk($disk)->exists($storagePath)) {
            Storage::disk($disk)->delete($storagePath);
        }

        return response()->json([
            'success' => true,
            'message' => 'Attachment deleted successfully.',
        ]);
    }

    /**
     * Resolve target entity by type and ID.
     */
    protected function resolveEntity(string $entityType, int $entityId): Project|Task|null
    {
        if ($entityType === 'project') {
            return Project::with('workspace')->find($entityId);
        }

        if ($entityType === 'task') {
            return Task::with('project.workspace')->find($entityId);
        }

        return null;
    }

    /**
     * Resolve workspace from target entity.
     */
    protected function resolveWorkspaceFromEntity(string $entityType, $entity): ?Workspace
    {
        if ($entityType === 'project') {
            return $entity->workspace ?? Workspace::find($entity->workspace_id);
        }

        if ($entityType === 'task') {
            return $entity->project?->workspace ?? Workspace::find($entity->project?->workspace_id);
        }

        return null;
    }

    /**
     * Verify whether user has access to view/attach to this entity.
     */
    protected function userCanAccessEntity(User $user, string $entityType, $entity): bool
    {
        $workspace = $this->resolveWorkspaceFromEntity($entityType, $entity);
        if (! $workspace) {
            return false;
        }

        return $this->userBelongsToWorkspace($user->id, $workspace->id);
    }

    /**
     * Check if user is an owner or member of the specified workspace.
     */
    protected function userBelongsToWorkspace(int $userId, ?int $workspaceId): bool
    {
        if (! $workspaceId) {
            return false;
        }

        $workspace = Workspace::find($workspaceId);
        if (! $workspace) {
            return false;
        }

        if ($workspace->owner_id === $userId) {
            return true;
        }

        return WorkspaceMember::where('workspace_id', $workspaceId)
            ->where('user_id', $userId)
            ->exists();
    }

    /**
     * Check if user has permission to delete this attachment.
     */
    protected function userCanDeleteAttachment(User $user, Attachment $attachment): bool
    {
        // 1. Author can delete their own attachment
        if ($attachment->user_id === $user->id) {
            return true;
        }

        // 2. Workspace owner can delete any attachment in their workspace
        $workspace = Workspace::find($attachment->workspace_id);
        if ($workspace && $workspace->owner_id === $user->id) {
            return true;
        }

        // 3. Project owner or manager can delete attachments in that project/task
        if ($attachment->entity_type === 'project') {
            $project = Project::find($attachment->entity_id);
            if ($project && ($project->owner_id === $user->id || $project->manager_id === $user->id)) {
                return true;
            }
        } elseif ($attachment->entity_type === 'task') {
            $task = Task::with('project')->find($attachment->entity_id);
            if ($task && ($task->creator_id === $user->id || $task->project?->owner_id === $user->id || $task->project?->manager_id === $user->id)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Sanitize user provided filename to remove path traversal and control characters.
     */
    protected function sanitizeFilename(string $filename): string
    {
        // Remove null bytes
        $name = str_replace(chr(0), '', $filename);

        // Normalize directory separators and strip path traversal
        $name = str_replace(['\\', '/'], DIRECTORY_SEPARATOR, $name);
        $name = basename($name);

        // Strip non-printable / control characters
        $name = preg_replace('/[\x00-\x1F\x7F]/', '', $name);

        // Limit length
        if (mb_strlen($name) > 200) {
            $ext = pathinfo($name, PATHINFO_EXTENSION);
            $base = pathinfo($name, PATHINFO_FILENAME);
            $name = mb_substr($base, 0, 190) . ($ext ? '.' . $ext : '');
        }

        return $name ?: 'attachment_' . time();
    }
}
