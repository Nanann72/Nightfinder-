"""
Test suite for Settings-related endpoints (Iteration 45)
- PATCH /api/users/me/password - Password change
- DELETE /api/users/me - Account deletion (soft-delete)
- GET /api/users/me/subscriptions - Fan subscriptions list
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
FAN_EMAIL = "fan@meandyou.fans"
FAN_PASSWORD = "TestFan2026!"
ADMIN_EMAIL = "admin@meandyou.fans"
ADMIN_PASSWORD = "Admin2026!"


class TestPasswordChange:
    """Test PATCH /api/users/me/password endpoint"""
    
    @pytest.fixture
    def fan_session(self):
        """Login as fan and return session with auth"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": FAN_EMAIL,
            "password": FAN_PASSWORD
        })
        assert resp.status_code == 200, f"Fan login failed: {resp.text}"
        data = resp.json()
        token = data.get("access_token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        return session
    
    def test_password_change_wrong_current(self, fan_session):
        """Test password change with wrong current password returns 400"""
        resp = fan_session.patch(f"{BASE_URL}/api/users/me/password", json={
            "current_password": "WrongPassword123!",
            "new_password": "NewPassword2026!"
        })
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "incorrect" in data.get("detail", "").lower() or "actuel" in data.get("detail", "").lower(), \
            f"Expected error about incorrect password, got: {data}"
        print(f"SUCCESS: Wrong current password returns 400 with message: {data.get('detail')}")
    
    def test_password_change_same_password(self, fan_session):
        """Test password change with same password returns 400"""
        resp = fan_session.patch(f"{BASE_URL}/api/users/me/password", json={
            "current_password": FAN_PASSWORD,
            "new_password": FAN_PASSWORD
        })
        assert resp.status_code == 400, f"Expected 400, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "différent" in data.get("detail", "").lower() or "same" in data.get("detail", "").lower(), \
            f"Expected error about same password, got: {data}"
        print(f"SUCCESS: Same password returns 400 with message: {data.get('detail')}")
    
    def test_password_change_too_short(self, fan_session):
        """Test password change with too short new password returns 422"""
        resp = fan_session.patch(f"{BASE_URL}/api/users/me/password", json={
            "current_password": FAN_PASSWORD,
            "new_password": "abc"  # Too short
        })
        assert resp.status_code == 422, f"Expected 422, got {resp.status_code}: {resp.text}"
        print("SUCCESS: Too short password returns 422 validation error")
    
    def test_password_change_success_and_revert(self, fan_session):
        """Test successful password change and revert back"""
        new_password = "TempPassword2026!"
        
        # Change password
        resp = fan_session.patch(f"{BASE_URL}/api/users/me/password", json={
            "current_password": FAN_PASSWORD,
            "new_password": new_password
        })
        assert resp.status_code == 200, f"Password change failed: {resp.text}"
        data = resp.json()
        assert data.get("ok") == True, f"Expected ok=True, got: {data}"
        print("SUCCESS: Password changed successfully")
        
        # Verify new password works by logging in
        session2 = requests.Session()
        session2.headers.update({"Content-Type": "application/json"})
        resp2 = session2.post(f"{BASE_URL}/api/auth/login", json={
            "email": FAN_EMAIL,
            "password": new_password
        })
        assert resp2.status_code == 200, f"Login with new password failed: {resp2.text}"
        token2 = resp2.json().get("access_token")
        session2.headers.update({"Authorization": f"Bearer {token2}"})
        print("SUCCESS: Login with new password works")
        
        # Revert password back to original
        resp3 = session2.patch(f"{BASE_URL}/api/users/me/password", json={
            "current_password": new_password,
            "new_password": FAN_PASSWORD
        })
        assert resp3.status_code == 200, f"Password revert failed: {resp3.text}"
        print("SUCCESS: Password reverted back to original")
    
    def test_password_change_unauthenticated(self):
        """Test password change without auth returns 401"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        resp = session.patch(f"{BASE_URL}/api/users/me/password", json={
            "current_password": "anything",
            "new_password": "NewPassword2026!"
        })
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}: {resp.text}"
        print("SUCCESS: Unauthenticated request returns 401")


class TestAccountDeletion:
    """Test DELETE /api/users/me endpoint - using throwaway account"""
    
    def test_delete_account_soft_delete(self):
        """Test account deletion sets banned=true (soft delete)"""
        # Create a throwaway test account
        test_email = f"test_delete_{os.urandom(4).hex()}@meandyou.fans"
        test_password = "TestDelete2026!"
        
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        
        # Register throwaway account
        resp = session.post(f"{BASE_URL}/api/auth/register", json={
            "email": test_email,
            "password": test_password,
            "name": "Test Delete User"
        })
        assert resp.status_code == 200, f"Registration failed: {resp.text}"
        token = resp.json().get("access_token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        print(f"SUCCESS: Created throwaway account: {test_email}")
        
        # Delete the account
        resp2 = session.delete(f"{BASE_URL}/api/users/me")
        assert resp2.status_code == 200, f"Delete failed: {resp2.text}"
        data = resp2.json()
        assert data.get("ok") == True, f"Expected ok=True, got: {data}"
        print("SUCCESS: Account deletion returned ok=True")
        
        # Login still works but returns banned=true in user data
        session2 = requests.Session()
        session2.headers.update({"Content-Type": "application/json"})
        resp3 = session2.post(f"{BASE_URL}/api/auth/login", json={
            "email": test_email,
            "password": test_password
        })
        # Login returns 200 but user has banned=true
        assert resp3.status_code == 200, f"Login failed: {resp3.text}"
        login_data = resp3.json()
        assert login_data.get("user", {}).get("banned") == True, f"Expected banned=true, got: {login_data}"
        print("SUCCESS: Login returns user with banned=true")
        
        # Verify banned user cannot access authenticated endpoints
        token2 = login_data.get("access_token")
        session2.headers.update({"Authorization": f"Bearer {token2}"})
        resp4 = session2.get(f"{BASE_URL}/api/auth/me")
        assert resp4.status_code == 403, f"Expected 403 for banned user, got {resp4.status_code}: {resp4.text}"
        print("SUCCESS: Banned user gets 403 on /api/auth/me")
    
    def test_delete_account_unauthenticated(self):
        """Test account deletion without auth returns 401"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        resp = session.delete(f"{BASE_URL}/api/users/me")
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}: {resp.text}"
        print("SUCCESS: Unauthenticated delete returns 401")


class TestUserSubscriptions:
    """Test GET /api/users/me/subscriptions endpoint"""
    
    @pytest.fixture
    def fan_session(self):
        """Login as fan and return session with auth"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": FAN_EMAIL,
            "password": FAN_PASSWORD
        })
        assert resp.status_code == 200, f"Fan login failed: {resp.text}"
        data = resp.json()
        token = data.get("access_token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        return session
    
    def test_get_subscriptions(self, fan_session):
        """Test getting user subscriptions returns list"""
        resp = fan_session.get(f"{BASE_URL}/api/users/me/subscriptions")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert isinstance(data, list), f"Expected list, got: {type(data)}"
        print(f"SUCCESS: Got {len(data)} subscriptions")
        
        # If there are subscriptions, verify structure
        if data:
            sub = data[0]
            assert "creator_id" in sub, "Missing creator_id in subscription"
            assert "creator" in sub, "Missing creator object in subscription"
            print(f"SUCCESS: Subscription structure is valid")
    
    def test_get_subscriptions_unauthenticated(self):
        """Test getting subscriptions without auth returns 401"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        resp = session.get(f"{BASE_URL}/api/users/me/subscriptions")
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}: {resp.text}"
        print("SUCCESS: Unauthenticated request returns 401")


class TestUserProfileUpdate:
    """Test PATCH /api/users/me endpoint for profile updates"""
    
    @pytest.fixture
    def fan_session(self):
        """Login as fan and return session with auth"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": FAN_EMAIL,
            "password": FAN_PASSWORD
        })
        assert resp.status_code == 200, f"Fan login failed: {resp.text}"
        data = resp.json()
        token = data.get("access_token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        return session
    
    def test_update_profile_name(self, fan_session):
        """Test updating profile name"""
        # Get current name
        resp = fan_session.get(f"{BASE_URL}/api/auth/me")
        assert resp.status_code == 200
        original_name = resp.json().get("name", "Test Fan")
        
        # Update name
        new_name = "Updated Test Fan"
        resp2 = fan_session.patch(f"{BASE_URL}/api/users/me", json={"name": new_name})
        assert resp2.status_code == 200, f"Update failed: {resp2.text}"
        data = resp2.json()
        assert data.get("name") == new_name, f"Name not updated: {data}"
        print(f"SUCCESS: Name updated to '{new_name}'")
        
        # Revert name
        resp3 = fan_session.patch(f"{BASE_URL}/api/users/me", json={"name": original_name})
        assert resp3.status_code == 200
        print(f"SUCCESS: Name reverted to '{original_name}'")
    
    def test_update_profile_bio(self, fan_session):
        """Test updating profile bio"""
        test_bio = "Test bio for iteration 45"
        resp = fan_session.patch(f"{BASE_URL}/api/users/me", json={"bio": test_bio})
        assert resp.status_code == 200, f"Update failed: {resp.text}"
        data = resp.json()
        assert data.get("bio") == test_bio, f"Bio not updated: {data}"
        print(f"SUCCESS: Bio updated")
        
        # Clear bio
        resp2 = fan_session.patch(f"{BASE_URL}/api/users/me", json={"bio": ""})
        assert resp2.status_code == 200
        print("SUCCESS: Bio cleared")
    
    def test_update_email_notifications(self, fan_session):
        """Test toggling email notifications"""
        # Toggle off
        resp = fan_session.patch(f"{BASE_URL}/api/users/me", json={"email_notifications_enabled": False})
        assert resp.status_code == 200, f"Update failed: {resp.text}"
        data = resp.json()
        assert data.get("email_notifications_enabled") == False, f"Notifications not disabled: {data}"
        print("SUCCESS: Email notifications disabled")
        
        # Toggle on
        resp2 = fan_session.patch(f"{BASE_URL}/api/users/me", json={"email_notifications_enabled": True})
        assert resp2.status_code == 200
        data2 = resp2.json()
        assert data2.get("email_notifications_enabled") == True, f"Notifications not enabled: {data2}"
        print("SUCCESS: Email notifications enabled")


class TestAuthEndpoints:
    """Test basic auth endpoints work correctly"""
    
    def test_login_fan(self):
        """Test fan login works"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": FAN_EMAIL,
            "password": FAN_PASSWORD
        })
        assert resp.status_code == 200, f"Login failed: {resp.text}"
        data = resp.json()
        assert "access_token" in data, "Missing access_token"
        assert "user" in data, "Missing user object"
        assert data["user"]["email"] == FAN_EMAIL, "Email mismatch"
        print(f"SUCCESS: Fan login works, role={data['user'].get('role')}")
    
    def test_login_admin(self):
        """Test admin login works"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert resp.status_code == 200, f"Login failed: {resp.text}"
        data = resp.json()
        assert data["user"]["role"] == "admin", f"Expected admin role, got: {data['user'].get('role')}"
        print("SUCCESS: Admin login works")
    
    def test_auth_me(self):
        """Test /api/auth/me returns user data"""
        session = requests.Session()
        session.headers.update({"Content-Type": "application/json"})
        resp = session.post(f"{BASE_URL}/api/auth/login", json={
            "email": FAN_EMAIL,
            "password": FAN_PASSWORD
        })
        token = resp.json().get("access_token")
        session.headers.update({"Authorization": f"Bearer {token}"})
        
        resp2 = session.get(f"{BASE_URL}/api/auth/me")
        assert resp2.status_code == 200, f"Auth/me failed: {resp2.text}"
        data = resp2.json()
        assert data.get("email") == FAN_EMAIL, f"Email mismatch: {data}"
        print("SUCCESS: /api/auth/me returns correct user data")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
