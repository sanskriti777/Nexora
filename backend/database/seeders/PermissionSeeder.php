<?php

namespace Database\Seeders;

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Seeder;

class PermissionSeeder extends Seeder
{
    public function run(): void
    {
        $permissions = [
            ['name' => 'Manage Workspaces', 'slug' => 'workspaces.manage', 'description' => 'Create, edit, delete workspaces'],
            ['name' => 'Manage Projects', 'slug' => 'projects.manage', 'description' => 'Create, edit, delete projects'],
            ['name' => 'View Projects', 'slug' => 'projects.view', 'description' => 'View projects and overviews'],
            ['name' => 'Manage Tasks', 'slug' => 'tasks.manage', 'description' => 'Create, edit, delete tasks'],
            ['name' => 'Update Task Status', 'slug' => 'tasks.update_status', 'description' => 'Move tasks across Kanban columns'],
            ['name' => 'View Analytics', 'slug' => 'analytics.view', 'description' => 'View project and team analytics'],
        ];

        foreach ($permissions as $perm) {
            Permission::firstOrCreate(['slug' => $perm['slug']], $perm);
        }

        // Attach all permissions to Admin
        $adminRole = Role::where('slug', 'admin')->first();
        if ($adminRole) {
            $allPermIds = Permission::pluck('id');
            $adminRole->permissions()->sync($allPermIds);
        }
    }
}
