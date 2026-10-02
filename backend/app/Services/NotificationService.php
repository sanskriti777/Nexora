<?php

namespace App\Services;

use App\Models\Notification;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use InvalidArgumentException;

class NotificationService
{
    /**
     * Create and dispatch a notification for a single user.
     */
    public function createNotification(
        User $user,
        ?Workspace $workspace,
        string $type,
        string $title,
        string $message,
        ?string $entityType = null,
        ?string $entityId = null,
        array $data = []
    ): Notification {
        // Enforce controlled notification type system
        if (! in_array($type, Notification::ALLOWED_TYPES, true)) {
            throw new InvalidArgumentException("Invalid notification type: {$type}");
        }

        // Deduplication safeguard: don't create duplicate unread notification with identical type, entity, and user within 5 seconds
        $recentDuplicate = Notification::forUser($user->id)
            ->where('type', $type)
            ->where('entity_type', $entityType)
            ->where('entity_id', (string) $entityId)
            ->unread()
            ->where('created_at', '>=', now()->subSeconds(5))
            ->first();

        if ($recentDuplicate) {
            return $recentDuplicate;
        }

        $notification = Notification::create([
            'type' => $type,
            'notifiable_type' => User::class,
            'notifiable_id' => $user->id,
            'workspace_id' => $workspace?->id,
            'title' => $title,
            'message' => $message,
            'entity_type' => $entityType,
            'entity_id' => $entityId !== null ? (string) $entityId : null,
            'data' => $data,
        ]);

        $this->dispatchRealtime($notification);

        return $notification;
    }

    /**
     * Send a notification to a specific user (alias for createNotification).
     */
    public function sendToUser(
        User $user,
        ?Workspace $workspace,
        string $type,
        string $title,
        string $message,
        ?string $entityType = null,
        ?string $entityId = null,
        array $data = []
    ): Notification {
        return $this->createNotification($user, $workspace, $type, $title, $message, $entityType, $entityId, $data);
    }

    /**
     * Send a notification to multiple users.
     */
    public function sendToUsers(
        iterable $users,
        ?Workspace $workspace,
        string $type,
        string $title,
        string $message,
        ?string $entityType = null,
        ?string $entityId = null,
        array $data = []
    ): void {
        foreach ($users as $user) {
            $this->createNotification($user, $workspace, $type, $title, $message, $entityType, $entityId, $data);
        }
    }

    /**
     * Retrieve paginated notifications for the specified user with authorization and filtering.
     */
    public function getNotifications(User $user, array $filters = [], int $perPage = 20): LengthAwarePaginator
    {
        $query = Notification::forUser($user->id)->orderBy('created_at', 'desc');

        if (! empty($filters['workspace_id'])) {
            $query->inWorkspace((int) $filters['workspace_id']);
        }

        if (! empty($filters['unread_only']) || (isset($filters['filter']) && $filters['filter'] === 'unread')) {
            $query->unread();
        }

        if (! empty($filters['type'])) {
            $query->where('type', $filters['type']);
        }

        return $query->paginate($perPage);
    }

    /**
     * Retrieve unread count for user, optionally scoped to workspace.
     */
    public function getUnreadCount(User $user, ?int $workspaceId = null): int
    {
        $query = Notification::forUser($user->id)->unread();

        if ($workspaceId) {
            $query->inWorkspace($workspaceId);
        }

        return $query->count();
    }

    /**
     * Mark a specific notification as read, ensuring ownership authorization.
     */
    public function markAsRead(User $user, string $notificationId): Notification
    {
        $notification = Notification::forUser($user->id)->findOrFail($notificationId);

        if (! $notification->read_at) {
            $notification->update(['read_at' => now()]);
        }

        return $notification;
    }

    /**
     * Mark all notifications as read for a user, optionally scoped to workspace.
     */
    public function markAllAsRead(User $user, ?int $workspaceId = null): int
    {
        $query = Notification::forUser($user->id)->unread();

        if ($workspaceId) {
            $query->inWorkspace($workspaceId);
        }

        return $query->update(['read_at' => now()]);
    }

    /**
     * Dispatch the notification to the real-time server (Node.js/Socket.IO).
     */
    protected function dispatchRealtime(Notification $notification): void
    {
        try {
            $realtimeUrl = config('services.realtime.url', 'http://127.0.0.1:8002');
            $secret = config('services.realtime.secret', 'nexora-internal-secret');

            Http::withHeaders([
                'X-Internal-Secret' => $secret,
            ])->timeout(2)->post("{$realtimeUrl}/internal/notifications", [
                'notification' => [
                    'id' => $notification->id,
                    'type' => $notification->type,
                    'title' => $notification->title,
                    'message' => $notification->message,
                    'entityType' => $notification->entity_type,
                    'entityId' => $notification->entity_id,
                    'data' => $notification->data ?? [],
                    'readAt' => $notification->read_at ? $notification->read_at->toISOString() : null,
                    'createdAt' => $notification->created_at ? $notification->created_at->toISOString() : now()->toISOString(),
                    'userId' => $notification->notifiable_id,
                    'workspaceId' => $notification->workspace_id,
                ],
            ]);
        } catch (\Exception $e) {
            Log::error('Failed to dispatch real-time notification: ' . $e->getMessage());
        }
    }
}
