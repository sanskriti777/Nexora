<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    /**
     * 1. Successful registration
     */
    public function test_user_can_register_successfully(): void
    {
        $response = $this->postJson('/api/register', [
            'name' => 'Jane Doe',
            'email' => 'jane@example.com',
            'password' => 'SecurePass123',
            'password_confirmation' => 'SecurePass123',
        ]);

        $response->assertStatus(201)
                 ->assertJson([
                     'success' => true,
                     'message' => 'User registered successfully',
                     'data' => [
                         'user' => [
                             'name' => 'Jane Doe',
                             'email' => 'jane@example.com',
                         ],
                     ],
                 ])
                 ->assertJsonStructure([
                     'success',
                     'message',
                     'data' => [
                         'user' => ['id', 'name', 'email', 'created_at', 'updated_at'],
                         'token',
                     ],
                 ]);

        $response->assertJsonMissing(['password' => 'SecurePass123']);

        $this->assertDatabaseHas('users', [
            'email' => 'jane@example.com',
            'name' => 'Jane Doe',
        ]);
    }

    /**
     * 2. Registration validation failure
     */
    public function test_registration_fails_with_validation_errors(): void
    {
        $response = $this->postJson('/api/register', [
            'name' => '',
            'email' => 'not-an-email',
            'password' => 'short',
            'password_confirmation' => 'different',
        ]);

        $response->assertStatus(422)
                 ->assertJsonValidationErrors(['name', 'email', 'password']);
    }

    /**
     * 3. Duplicate email rejection
     */
    public function test_registration_rejects_duplicate_email(): void
    {
        User::factory()->create([
            'email' => 'duplicate@example.com',
        ]);

        $response = $this->postJson('/api/register', [
            'name' => 'Second User',
            'email' => 'duplicate@example.com',
            'password' => 'Password123',
            'password_confirmation' => 'Password123',
        ]);

        $response->assertStatus(422)
                 ->assertJsonValidationErrors(['email']);
    }

    /**
     * 4. Password is saved as a secure hash
     */
    public function test_registration_securely_hashes_password(): void
    {
        $plainPassword = 'MySecretPassword123';

        $response = $this->postJson('/api/register', [
            'name' => 'Security Tester',
            'email' => 'security@example.com',
            'password' => $plainPassword,
            'password_confirmation' => $plainPassword,
        ]);

        $response->assertStatus(201);

        $user = User::where('email', 'security@example.com')->first();
        $this->assertNotNull($user);
        $this->assertNotEquals($plainPassword, $user->password);
        $this->assertTrue(Hash::check($plainPassword, $user->password));
    }

    /**
     * 5. Successful login
     */
    public function test_user_can_login_with_valid_credentials(): void
    {
        $user = User::factory()->create([
            'email' => 'loginuser@example.com',
            'password' => 'ValidPassword123',
        ]);

        $response = $this->postJson('/api/login', [
            'email' => 'loginuser@example.com',
            'password' => 'ValidPassword123',
        ]);

        $response->assertStatus(200)
                 ->assertJson([
                     'success' => true,
                     'message' => 'Login successful',
                     'data' => [
                         'user' => [
                             'id' => $user->id,
                             'email' => 'loginuser@example.com',
                         ],
                     ],
                 ])
                 ->assertJsonStructure([
                     'success',
                     'message',
                     'data' => [
                         'user' => ['id', 'name', 'email'],
                         'token',
                     ],
                 ]);

        $response->assertJsonMissing(['password']);
    }

    /**
     * 6. Invalid login credentials
     */
    public function test_login_fails_with_invalid_credentials(): void
    {
        User::factory()->create([
            'email' => 'existing@example.com',
            'password' => 'CorrectPassword123',
        ]);

        // Wrong password
        $response = $this->postJson('/api/login', [
            'email' => 'existing@example.com',
            'password' => 'WrongPassword',
        ]);

        $response->assertStatus(401)
                 ->assertJson([
                     'success' => false,
                     'message' => 'Invalid login credentials',
                 ]);

        // Non-existent email
        $responseUnknown = $this->postJson('/api/login', [
            'email' => 'nonexistent@example.com',
            'password' => 'CorrectPassword123',
        ]);

        $responseUnknown->assertStatus(401)
                        ->assertJson([
                            'success' => false,
                            'message' => 'Invalid login credentials',
                        ]);
    }

    /**
     * 7. Authenticated /api/me
     */
    public function test_authenticated_user_can_access_me_endpoint(): void
    {
        $user = User::factory()->create([
            'name' => 'Profile User',
            'email' => 'profile@example.com',
        ]);

        $token = $user->createToken('auth_token')->plainTextToken;

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
                         ->getJson('/api/me');

        $response->assertStatus(200)
                 ->assertJson([
                     'success' => true,
                     'data' => [
                         'user' => [
                             'id' => $user->id,
                             'name' => 'Profile User',
                             'email' => 'profile@example.com',
                         ],
                     ],
                 ]);

        $response->assertJsonMissing(['password']);
    }

    /**
     * 8. Unauthenticated /api/me returns 401
     */
    public function test_unauthenticated_request_to_me_returns_401(): void
    {
        $response = $this->getJson('/api/me');

        $response->assertStatus(401);
    }

    /**
     * 9. Authenticated logout
     */
    public function test_authenticated_user_can_logout(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('auth_token')->plainTextToken;

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
                         ->postJson('/api/logout');

        $response->assertStatus(200)
                 ->assertJson([
                     'success' => true,
                     'message' => 'Logged out successfully',
                 ]);
    }

    /**
     * 10. Token is revoked after logout
     */
    public function test_token_is_revoked_after_logout(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('auth_token')->plainTextToken;

        // Logout revoking the token
        $logoutResponse = $this->withHeader('Authorization', 'Bearer ' . $token)
                               ->postJson('/api/logout');
        $logoutResponse->assertStatus(200);

        // Attempting to access protected endpoint with the revoked token must return 401
        // Flush auth guard cache simulating a fresh subsequent request
        $this->app['auth']->forgetGuards();

        $meResponse = $this->withHeader('Authorization', 'Bearer ' . $token)
                           ->getJson('/api/me');
        $this->assertDatabaseCount('personal_access_tokens', 0);
        $meResponse->assertStatus(401);
    }
}
