<?php

namespace App\Http\Controllers;

use App\Models\Notification;
use App\Models\User;
use App\Models\Workspace;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    /**
     * List notifications for the authenticated user with optional filtering and pagination.
     */
    public function index(Request $request, NotificationService $notificationService): JsonResponse
    {
        $user = $request->user();
        $workspaceId = $request->header('X-Workspace-Id') ?? $request->query('workspace_id');

        if ($workspaceId) {
            $hasAccess = Workspace::where('id', $workspaceId)
                ->where(function ($query) use ($user) {
                    $query->where('owner_id', $user->id)
                          ->orWhereHas('members', fn($m) => $m->where('users.id', $user->id));
                })->exists();

            if (! $hasAccess) {
                return response()->json([
                    'success' => false,
                    'message' => 'Unauthorized access to the specified workspace.',
                ], 403);
            }
        }

        $filters = [
            'workspace_id' => $workspaceId ? (int) $workspaceId : null,
            'unread_only' => $request->boolean('unread_only') || $request->query('filter') === 'unread',
            'type' => $request->query('type'),
        ];

        $perPage = max(1, min(100, (int) $request->query('per_page', 20)));
        $notifications = $notificationService->getNotifications($user, $filters, $perPage);

        return response()->json($notifications);
    }

    /**
     * Retrieve the unread notifications count for the authenticated user.
     */
    public function unreadCount(Request $request, NotificationService $notificationService): JsonResponse
    {
        $user = $request->user();
        $workspaceId = $request->header('X-Workspace-Id') ?? $request->query('workspace_id');

        if ($workspaceId) {
            $hasAccess = Workspace::where('id', $workspaceId)
                ->where(function ($query) use ($user) {
                    $query->where('owner_id', $user->id)
                          ->orWhereHas('members', fn($m) => $m->where('users.id', $user->id));
                })->exists();

            if (! $hasAccess) {
                return response()->json([
                    'success' => false,
                    'message' => 'Unauthorized access to the specified workspace.',
                ], 403);
            }
        }

        $count = $notificationService->getUnreadCount($user, $workspaceId ? (int) $workspaceId : null);

        return response()->json(['count' => $count]);
    }

    /**
     * Mark a single notification as read.
     */
    public function markAsRead(Request $request, string $id, NotificationService $notificationService): JsonResponse
    {
        $notification = $notificationService->markAsRead($request->user(), $id);

        return response()->json($notification);
    }

    /**
     * Mark all notifications as read for the authenticated user.
     */
    public function markAllAsRead(Request $request, NotificationService $notificationService): JsonResponse
    {
        $user = $request->user();
        $workspaceId = $request->header('X-Workspace-Id') ?? $request->query('workspace_id');

        if ($workspaceId) {
            $hasAccess = Workspace::where('id', $workspaceId)
                ->where(function ($query) use ($user) {
                    $query->where('owner_id', $user->id)
                          ->orWhereHas('members', fn($m) => $m->where('users.id', $user->id));
                })->exists();

            if (! $hasAccess) {
                return response()->json([
                    'success' => false,
                    'message' => 'Unauthorized access to the specified workspace.',
                ], 403);
            }
        }

        $updatedCount = $notificationService->markAllAsRead($user, $workspaceId ? (int) $workspaceId : null);

        return response()->json([
            'message' => 'All notifications marked as read',
            'updated' => $updatedCount,
        ]);
    }

    /**
     * Delete/dismiss a notification owned by the authenticated user.
     */
    public function destroy(Request $request, string $id): JsonResponse
    {
        $notification = Notification::forUser($request->user()->id)->findOrFail($id);
        $notification->delete();

        return response()->json([
            'message' => 'Notification deleted successfully',
        ]);
    }

    /**
     * Internal endpoint for node/realtime-server to create persistent notifications.
     */
    public function storeInternal(Request $request, NotificationService $notificationService): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => 'required|integer',
            'workspace_id' => 'required|integer',
            'type' => 'required|string',
            'title' => 'required|string',
            'message' => 'required|string',
            'entity_type' => 'nullable|string',
            'entity_id' => 'nullable|string',
            'data' => 'nullable|array',
        ]);

        $user = User::findOrFail($validated['user_id']);
        $workspace = Workspace::findOrFail($validated['workspace_id']);

        $notificationService->sendToUser(
            $user,
            $workspace,
            $validated['type'],
            $validated['title'],
            $validated['message'],
            $validated['entity_type'] ?? null,
            $validated['entity_id'] ?? null,
            $validated['data'] ?? []
        );

        return response()->json(['message' => 'Notification created successfully']);
    }

    /**
     * Internal endpoint for processing chat message mentions into notifications.
     */
    public function processChatMentions(Request $request, NotificationService $notificationService): JsonResponse
    {
        $validated = $request->validate([
            'workspace_id' => 'required|integer',
            'content' => 'required|string',
            'sender_id' => 'required|integer',
            'channel_id' => 'nullable|string',
            'conversation_id' => 'nullable|string',
            'message_id' => 'required|string',
        ]);

        $workspace = Workspace::findOrFail($validated['workspace_id']);

        // Extract @mentions
        preg_match_all('/@([a-zA-Z0-9_\.\-]+)/', $validated['content'], $matches);
        $names = array_unique($matches[1]);

        if (empty($names)) {
            return response()->json(['message' => 'No mentions found']);
        }

        $sender = User::find($validated['sender_id']);
        $senderName = $sender ? $sender->name : 'Someone';

        $users = User::where(function ($q) use ($names) {
            $q->whereIn('name', $names)
              ->orWhereIn('email', $names);
        })->where('id', '!=', $validated['sender_id'])->get();

        foreach ($users as $user) {
            $notificationService->sendToUser(
                $user,
                $workspace,
                Notification::TYPE_MENTION,
                'New Mention',
                "{$senderName} mentioned you in a chat message",
                $validated['channel_id'] ? 'channel' : 'conversation',
                $validated['channel_id'] ?? $validated['conversation_id'],
                [
                    'message_id' => $validated['message_id'],
                    'channel_id' => $validated['channel_id'] ?? null,
                    'conversation_id' => $validated['conversation_id'] ?? null,
                ]
            );
        }

        return response()->json([
            'message' => 'Mentions processed',
            'count' => $users->count(),
        ]);
    }
}
