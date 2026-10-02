<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\Attachment;
use App\Models\Project;
use App\Models\Role;
use App\Models\Task;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class AttachmentTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
    }

    protected function createWorkspaceWithOwner(): array
    {
        $owner = User::factory()->create([
            'name' => 'Workspace Owner',
            'email' => 'owner_' . uniqid() . '@example.com',
        ]);

        $workspace = Workspace::create([
            'name' => 'Primary Workspace',
            'slug' => 'workspace-' . uniqid(),
            'owner_id' => $owner->id,
        ]);

        $workspace->members()->attach($owner->id, ['role_id' => null, 'joined_at' => now()]);

        return [$owner, $workspace];
    }

    protected function addMemberToWorkspace(Workspace $workspace, User $user, string $roleSlug = 'team_member'): void
    {
        $role = Role::firstOrCreate(['slug' => $roleSlug], ['name' => ucfirst(str_replace('_', ' ', $roleSlug))]);
        $workspace->members()->attach($user->id, [
            'role_id' => $role->id,
            'joined_at' => now(),
        ]);
    }

    protected function createProject(Workspace $workspace, User $owner): Project
    {
        return Project::create([
            'workspace_id' => $workspace->id,
            'owner_id' => $owner->id,
            'name' => 'Alpha Project',
            'slug' => 'alpha-project-' . uniqid(),
            'status' => 'planning',
        ]);
    }

    protected function createTask(Workspace $workspace, Project $project, User $creator): Task
    {
        return Task::create([
            'workspace_id' => $workspace->id,
            'project_id' => $project->id,
            'creator_id' => $creator->id,
            'title' => 'Initial Task',
            'status' => 'todo',
        ]);
    }

    // 1. Authenticated user can list attachments
    public function test_authenticated_user_can_list_attachments(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();
        $project = $this->createProject($workspace, $owner);

        Attachment::create([
            'workspace_id' => $workspace->id,
            'user_id' => $owner->id,
            'entity_type' => 'project',
            'entity_id' => $project->id,
            'original_name' => 'specs.pdf',
            'storage_path' => "attachments/{$workspace->id}/test1.pdf",
            'mime_type' => 'application/pdf',
            'file_size' => 1024,
            'disk' => 'local',
        ]);

        $response = $this->actingAs($owner)->getJson("/api/attachments?attachable_type=project&attachable_id={$project->id}");

        $response->assertStatus(200);
        $this->assertTrue($response->json('success'));
        $this->assertCount(1, $response->json('data'));
        $this->assertEquals('specs.pdf', $response->json('data.0.original_name'));
    }

    // 2. Unauthenticated user is rejected
    public function test_unauthenticated_user_is_rejected(): void
    {
        $response = $this->getJson('/api/attachments');
        $response->assertStatus(401);

        $response = $this->postJson('/api/attachments', []);
        $response->assertStatus(401);

        $response = $this->getJson('/api/attachments/1');
        $response->assertStatus(401);

        $response = $this->getJson('/api/attachments/1/download');
        $response->assertStatus(401);

        $response = $this->deleteJson('/api/attachments/1');
        $response->assertStatus(401);
    }

    // 3. Valid file uploads successfully
    public function test_valid_file_uploads_successfully(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();
        $project = $this->createProject($workspace, $owner);

        $file = UploadedFile::fake()->create('architecture.png', 500, 'image/png');

        $response = $this->actingAs($owner)->postJson('/api/attachments', [
            'file' => $file,
            'attachable_type' => 'project',
            'attachable_id' => $project->id,
        ]);

        $response->assertStatus(201);
        $this->assertTrue($response->json('success'));
        $this->assertEquals('architecture.png', $response->json('data.original_name'));
        $this->assertEquals('image/png', $response->json('data.mime_type'));

        $storagePath = $response->json('data.storage_path');
        $this->assertNotEmpty($storagePath);
        Storage::disk('local')->assertExists($storagePath);
    }

    // 4. Invalid file type rejected
    public function test_invalid_file_type_rejected(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();
        $project = $this->createProject($workspace, $owner);

        $phpFile = UploadedFile::fake()->create('malicious.php', 100, 'application/x-php');

        $response = $this->actingAs($owner)->postJson('/api/attachments', [
            'file' => $phpFile,
            'attachable_type' => 'project',
            'attachable_id' => $project->id,
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['file']);

        $exeFile = UploadedFile::fake()->create('trojan.exe', 100, 'application/octet-stream');

        $response = $this->actingAs($owner)->postJson('/api/attachments', [
            'file' => $exeFile,
            'attachable_type' => 'project',
            'attachable_id' => $project->id,
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['file']);

        // Double extension rejection
        $doubleExtFile = UploadedFile::fake()->create('exploit.php.png', 100, 'image/png');

        $response = $this->actingAs($owner)->postJson('/api/attachments', [
            'file' => $doubleExtFile,
            'attachable_type' => 'project',
            'attachable_id' => $project->id,
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['file']);

        // MIME spoofing rejection (image extension but dangerous script MIME)
        $spoofedFile = UploadedFile::fake()->create('fake_image.png', 100, 'application/x-php');

        $response = $this->actingAs($owner)->postJson('/api/attachments', [
            'file' => $spoofedFile,
            'attachable_type' => 'project',
            'attachable_id' => $project->id,
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['file']);
    }

    // 5. Oversized file rejected
    public function test_oversized_file_rejected(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();
        $project = $this->createProject($workspace, $owner);

        // 25MB exceeds the 20MB limit (20480 KB)
        $hugeFile = UploadedFile::fake()->create('massive_archive.zip', 25000, 'application/zip');

        $response = $this->actingAs($owner)->postJson('/api/attachments', [
            'file' => $hugeFile,
            'attachable_type' => 'project',
            'attachable_id' => $project->id,
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['file']);
    }

    // 6. Project attachment created
    public function test_project_attachment_created(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();
        $project = $this->createProject($workspace, $owner);

        $file = UploadedFile::fake()->create('roadmap.pdf', 300, 'application/pdf');

        $response = $this->actingAs($owner)->postJson('/api/attachments', [
            'file' => $file,
            'attachable_type' => 'project',
            'attachable_id' => $project->id,
        ]);

        $response->assertStatus(201);
        $this->assertDatabaseHas('attachments', [
            'entity_type' => 'project',
            'entity_id' => $project->id,
            'original_name' => 'roadmap.pdf',
            'workspace_id' => $workspace->id,
        ]);
    }

    // 7. Task attachment created
    public function test_task_attachment_created(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();
        $project = $this->createProject($workspace, $owner);
        $task = $this->createTask($workspace, $project, $owner);

        $file = UploadedFile::fake()->create('bug_screenshot.png', 400, 'image/png');

        $response = $this->actingAs($owner)->postJson('/api/attachments', [
            'file' => $file,
            'attachable_type' => 'task',
            'attachable_id' => $task->id,
        ]);

        $response->assertStatus(201);
        $this->assertDatabaseHas('attachments', [
            'entity_type' => 'task',
            'entity_id' => $task->id,
            'original_name' => 'bug_screenshot.png',
            'workspace_id' => $workspace->id,
        ]);
    }

    // 8. Attachment metadata persisted
    public function test_attachment_metadata_persisted(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();
        $project = $this->createProject($workspace, $owner);

        $file = UploadedFile::fake()->create('design_system.docx', 120, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

        $response = $this->actingAs($owner)->postJson('/api/attachments', [
            'file' => $file,
            'attachable_type' => 'project',
            'attachable_id' => $project->id,
        ]);

        $response->assertStatus(201);
        $data = $response->json('data');

        $this->assertNotNull($data['id']);
        $this->assertEquals('design_system.docx', $data['original_name']);
        $this->assertEquals($owner->id, $data['user_id']);
        $this->assertEquals($workspace->id, $data['workspace_id']);
        $this->assertEquals('local', $data['disk']);
        $this->assertNotNull($data['file_size']);
        $this->assertNotNull($data['human_size']);
    }

    // 9. Attachment download works for authorized user
    public function test_attachment_download_works_for_authorized_user(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();
        $project = $this->createProject($workspace, $owner);

        $file = UploadedFile::fake()->create('download_me.txt', 50, 'text/plain');

        $uploadResponse = $this->actingAs($owner)->postJson('/api/attachments', [
            'file' => $file,
            'attachable_type' => 'project',
            'attachable_id' => $project->id,
        ]);

        $uploadResponse->assertStatus(201);
        $attachmentId = $uploadResponse->json('data.id');

        $downloadResponse = $this->actingAs($owner)->get("/api/attachments/{$attachmentId}/download");
        $downloadResponse->assertStatus(200);
        $downloadResponse->assertHeader('Content-Disposition', 'attachment; filename=download_me.txt');
    }

    // 10. Unauthorized workspace download rejected
    public function test_unauthorized_workspace_download_rejected(): void
    {
        [$owner1, $workspace1] = $this->createWorkspaceWithOwner();
        [$owner2, $workspace2] = $this->createWorkspaceWithOwner();

        $project1 = $this->createProject($workspace1, $owner1);
        $file = UploadedFile::fake()->create('confidential.pdf', 100, 'application/pdf');

        $uploadResponse = $this->actingAs($owner1)->postJson('/api/attachments', [
            'file' => $file,
            'attachable_type' => 'project',
            'attachable_id' => $project1->id,
        ]);

        $attachmentId = $uploadResponse->json('data.id');

        // User from workspace 2 tries to download workspace 1's file
        $response = $this->actingAs($owner2)->getJson("/api/attachments/{$attachmentId}/download");
        $response->assertStatus(403);
    }

    // 11. Unauthorized workspace listing rejected
    public function test_unauthorized_workspace_listing_rejected(): void
    {
        [$owner1, $workspace1] = $this->createWorkspaceWithOwner();
        [$owner2, $workspace2] = $this->createWorkspaceWithOwner();

        $project1 = $this->createProject($workspace1, $owner1);

        // User from workspace 2 tries to list attachments for project in workspace 1
        $response = $this->actingAs($owner2)->getJson("/api/attachments?attachable_type=project&attachable_id={$project1->id}");
        $response->assertStatus(403);
    }

    // 12. Unauthorized deletion rejected
    public function test_unauthorized_deletion_rejected(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();
        $member1 = User::factory()->create();
        $member2 = User::factory()->create();
        $this->addMemberToWorkspace($workspace, $member1);
        $this->addMemberToWorkspace($workspace, $member2);

        $project = $this->createProject($workspace, $owner);
        $file = UploadedFile::fake()->create('member1_file.pdf', 100, 'application/pdf');

        $uploadResponse = $this->actingAs($member1)->postJson('/api/attachments', [
            'file' => $file,
            'attachable_type' => 'project',
            'attachable_id' => $project->id,
        ]);

        $attachmentId = $uploadResponse->json('data.id');

        // member2 (regular member, not uploader, not project owner, not workspace owner) tries to delete
        $response = $this->actingAs($member2)->deleteJson("/api/attachments/{$attachmentId}");
        $response->assertStatus(403);
    }

    // 13. Authorized deletion works
    public function test_authorized_deletion_works(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();
        $project = $this->createProject($workspace, $owner);
        $file = UploadedFile::fake()->create('delete_me.pdf', 100, 'application/pdf');

        $uploadResponse = $this->actingAs($owner)->postJson('/api/attachments', [
            'file' => $file,
            'attachable_type' => 'project',
            'attachable_id' => $project->id,
        ]);

        $attachmentId = $uploadResponse->json('data.id');
        $storagePath = $uploadResponse->json('data.storage_path');

        Storage::disk('local')->assertExists($storagePath);

        $deleteResponse = $this->actingAs($owner)->deleteJson("/api/attachments/{$attachmentId}");
        $deleteResponse->assertStatus(200);
        $this->assertTrue($deleteResponse->json('success'));

        $this->assertDatabaseMissing('attachments', ['id' => $attachmentId]);
        Storage::disk('local')->assertMissing($storagePath);
    }

    // 14. Attachment activity is logged
    public function test_attachment_activity_is_logged(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();
        $project = $this->createProject($workspace, $owner);
        $file = UploadedFile::fake()->create('audit_test.pdf', 100, 'application/pdf');

        $uploadResponse = $this->actingAs($owner)->postJson('/api/attachments', [
            'file' => $file,
            'attachable_type' => 'project',
            'attachable_id' => $project->id,
        ]);

        $attachmentId = $uploadResponse->json('data.id');

        $this->assertDatabaseHas('activity_logs', [
            'workspace_id' => $workspace->id,
            'user_id' => $owner->id,
            'action' => 'attachment_uploaded',
            'entity_type' => 'Project',
            'entity_id' => $project->id,
        ]);

        $this->actingAs($owner)->deleteJson("/api/attachments/{$attachmentId}");

        $this->assertDatabaseHas('activity_logs', [
            'workspace_id' => $workspace->id,
            'user_id' => $owner->id,
            'action' => 'attachment_deleted',
            'entity_type' => 'Project',
            'entity_id' => $project->id,
        ]);
    }

    // 15. Cross-workspace resource attachment rejected
    public function test_cross_workspace_resource_attachment_rejected(): void
    {
        [$owner1, $workspace1] = $this->createWorkspaceWithOwner();
        [$owner2, $workspace2] = $this->createWorkspaceWithOwner();

        $project2 = $this->createProject($workspace2, $owner2);
        $file = UploadedFile::fake()->create('cross_test.pdf', 100, 'application/pdf');

        // Owner 1 tries to attach to Project 2 (which belongs to Workspace 2)
        $response = $this->actingAs($owner1)->postJson('/api/attachments', [
            'file' => $file,
            'attachable_type' => 'project',
            'attachable_id' => $project2->id,
        ]);

        $response->assertStatus(403);
    }

    // 16. Malicious/path traversal filename handled safely
    public function test_malicious_path_traversal_filename_handled_safely(): void
    {
        [$owner, $workspace] = $this->createWorkspaceWithOwner();
        $project = $this->createProject($workspace, $owner);

        // Client attempts path traversal in filename
        $maliciousFile = UploadedFile::fake()->create('../../../../etc/passwd.txt', 50, 'text/plain');

        $response = $this->actingAs($owner)->postJson('/api/attachments', [
            'file' => $maliciousFile,
            'attachable_type' => 'project',
            'attachable_id' => $project->id,
        ]);

        $response->assertStatus(201);
        $storagePath = $response->json('data.storage_path');

        // Verify stored path stays strictly inside attachments/{workspace_id}/
        $this->assertStringStartsWith("attachments/{$workspace->id}/", $storagePath);
        $this->assertStringNotContainsString('..', $storagePath);
        $this->assertStringNotContainsString('etc/passwd', $storagePath);

        // Verify original_name is sanitized
        $this->assertEquals('passwd.txt', $response->json('data.original_name'));

        Storage::disk('local')->assertExists($storagePath);
    }
}
