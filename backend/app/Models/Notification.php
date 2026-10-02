<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class Notification extends Model
{
    use HasFactory;

    public const TYPE_TASK_ASSIGNED = 'task_assigned';
    public const TYPE_TASK_STATUS_CHANGED = 'task_status_changed';
    public const TYPE_TASK_PRIORITY_CHANGED = 'task_priority_changed';
    public const TYPE_TASK_DUE_DATE_CHANGED = 'task_due_date_changed';
    public const TYPE_PROJECT_MEMBER_ADDED = 'project_member_added';
    public const TYPE_PROJECT_UPDATED = 'project_updated';
    public const TYPE_TEAM_MEMBER_ADDED = 'team_member_added';
    public const TYPE_MENTION = 'mention';
    public const TYPE_CHAT_MESSAGE = 'chat_message';
    public const TYPE_SYSTEM = 'system';

    public const ALLOWED_TYPES = [
        self::TYPE_TASK_ASSIGNED,
        self::TYPE_TASK_STATUS_CHANGED,
        self::TYPE_TASK_PRIORITY_CHANGED,
        self::TYPE_TASK_DUE_DATE_CHANGED,
        self::TYPE_PROJECT_MEMBER_ADDED,
        self::TYPE_PROJECT_UPDATED,
        self::TYPE_TEAM_MEMBER_ADDED,
        self::TYPE_MENTION,
        'chat_mention', // backwards compatibility alias
        self::TYPE_CHAT_MESSAGE,
        'chat_dm',      // backwards compatibility alias
        self::TYPE_SYSTEM,
    ];

    protected $table = 'notifications';

    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'type',
        'notifiable_type',
        'notifiable_id',
        'workspace_id',
        'title',
        'message',
        'entity_type',
        'entity_id',
        'data',
        'read_at',
    ];

    protected $appends = [
        'user_id',
    ];

    protected $casts = [
        'data' => 'array',
        'read_at' => 'datetime',
    ];

    public function getUserIdAttribute()
    {
        return $this->notifiable_id;
    }

    public function scopeForUser($query, int $userId)
    {
        return $query->where('notifiable_id', $userId)
                     ->where('notifiable_type', User::class);
    }

    public function scopeUnread($query)
    {
        return $query->whereNull('read_at');
    }

    public function scopeInWorkspace($query, int $workspaceId)
    {
        return $query->where('workspace_id', $workspaceId);
    }

    protected static function boot()
    {
        parent::boot();

        static::creating(function ($model) {
            if (empty($model->id)) {
                $model->id = (string) Str::uuid();
            }
            if ($model->data === null) {
                $model->data = [];
            }
        });
    }

    public function user()
    {
        // the notifiable is the user in our architecture
        return $this->belongsTo(User::class, 'notifiable_id');
    }

    public function workspace()
    {
        return $this->belongsTo(Workspace::class);
    }
}
