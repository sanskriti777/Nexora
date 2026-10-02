<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ActivityLog extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'workspace_id',
        'action',
        'entity_type',
        'entity_id',
        'details',
    ];

    protected $casts = [
        'details' => 'array',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function workspace(): BelongsTo
    {
        return $this->belongsTo(Workspace::class);
    }

    /**
     * Scope to filter activities by one or more workspace IDs.
     */
    public function scopeForWorkspace(Builder $query, int|array $workspaceId): Builder
    {
        return is_array($workspaceId)
            ? $query->whereIn('workspace_id', $workspaceId)
            : $query->where('workspace_id', $workspaceId);
    }

    /**
     * Scope to filter activities by user (actor).
     */
    public function scopeByUser(Builder $query, int $userId): Builder
    {
        return $query->where('user_id', $userId);
    }

    /**
     * Scope to filter activities by action.
     */
    public function scopeByAction(Builder $query, string $action): Builder
    {
        return $query->where('action', $action);
    }

    /**
     * Scope to filter activities by entity type and optional entity id.
     */
    public function scopeByEntity(Builder $query, string $entityType, ?int $entityId = null): Builder
    {
        // Support case-insensitive entity types (e.g. 'project' vs 'Project')
        $query->where(function ($q) use ($entityType) {
            $q->where('entity_type', $entityType)
              ->orWhere('entity_type', ucfirst($entityType))
              ->orWhere('entity_type', strtolower($entityType));
        });

        if ($entityId !== null) {
            $query->where('entity_id', $entityId);
        }

        return $query;
    }

    /**
     * Scope to filter activities between date range.
     */
    public function scopeBetweenDates(Builder $query, ?string $from, ?string $to): Builder
    {
        if ($from) {
            try {
                $fromDate = Carbon::parse($from)->startOfDay();
                $query->where('created_at', '>=', $fromDate);
            } catch (\Exception) {
                // Ignore invalid date format
            }
        }

        if ($to) {
            try {
                $toDate = Carbon::parse($to)->endOfDay();
                $query->where('created_at', '<=', $toDate);
            } catch (\Exception) {
                // Ignore invalid date format
            }
        }

        return $query;
    }

    /**
     * Scope to search activities across action, entity_type, user name, or details name/title.
     */
    public function scopeSearch(Builder $query, string $term): Builder
    {
        $term = trim($term);
        if ($term === '') {
            return $query;
        }

        return $query->where(function (Builder $q) use ($term) {
            $q->where('action', 'like', "%{$term}%")
              ->orWhere('entity_type', 'like', "%{$term}%")
              ->orWhereHas('user', function (Builder $userQuery) use ($term) {
                  $userQuery->where('name', 'like', "%{$term}%")
                            ->orWhere('email', 'like', "%{$term}%");
              });
        });
    }
}
