<?php

namespace Tests\Feature;

use Tests\TestCase;

class HealthTest extends TestCase
{
    public function test_health_check_endpoint_returns_success(): void
    {
        $response = $this->getJson('/api/health');

        $response->assertStatus(200)
                 ->assertJson([
                     'success' => true,
                     'message' => 'NEXORA API is running',
                 ]);
    }
}
