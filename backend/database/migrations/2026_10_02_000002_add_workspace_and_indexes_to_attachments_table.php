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
        Schema::table('attachments', function (Blueprint $table) {
            $table->foreignId('workspace_id')->nullable()->after('user_id')->constrained('workspaces')->onDelete('cascade');
            $table->string('disk')->default('local')->after('file_size');
            $table->index(['entity_type', 'entity_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('attachments', function (Blueprint $table) {
            $table->dropForeign(['workspace_id']);
            $table->dropIndex(['entity_type', 'entity_id']);
            $table->dropColumn(['workspace_id', 'disk']);
        });
    }
};
