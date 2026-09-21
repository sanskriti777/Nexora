<?php

namespace Database\Seeders;

use App\Models\Role;
use Illuminate\Database\Seeder;

class RoleSeeder extends Seeder
{
    public function run(): void
    {
        $roles = [
            [
                'name' => 'Admin',
                'slug' => 'admin',
                'description' => 'Full system administrator with platform-wide permissions.',
            ],
            [
                'name' => 'Project Manager',
                'slug' => 'project_manager',
                'description' => 'Manages workspaces, projects, teams, deadlines, and task assignments.',
            ],
            [
                'name' => 'Team Lead',
                'slug' => 'team_lead',
                'description' => 'Leads assigned team, creates tasks, and reviews team progress.',
            ],
            [
                'name' => 'Team Member',
                'slug' => 'team_member',
                'description' => 'Updates assigned tasks, participates in Kanban, comments, and uses chat.',
            ],
            [
                'name' => 'Viewer',
                'slug' => 'viewer',
                'description' => 'Read-only access to workspaces, projects, and tasks.',
            ],
        ];

        foreach ($roles as $role) {
            Role::firstOrCreate(['slug' => $role['slug']], $role);
        }
    }
}
