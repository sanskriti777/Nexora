<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('activity_logs', function (Blueprint $table) {
            $table->index(['workspace_id', 'created_at'], 'activity_logs_workspace_created_idx');
            $table->index(['workspace_id', 'action'], 'activity_logs_workspace_action_idx');
            $table->index(['workspace_id', 'entity_type', 'entity_id'], 'activity_logs_workspace_entity_idx');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('activity_logs', function (Blueprint $table) {
            $table->dropIndex('activity_logs_workspace_created_idx');
            $table->dropIndex('activity_logs_workspace_action_idx');
            $table->dropIndex('activity_logs_workspace_entity_idx');
        });
    }
};
