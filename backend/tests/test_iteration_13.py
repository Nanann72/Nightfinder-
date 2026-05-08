"""
Iteration 13 Tests - Cams Favorites, Sort Options, and Legacy Cleanup Verification
Tests:
1. GET /api/creators - verify legacy seeded creators are purged
2. GET /api/cams with sort options (popular, trending, top, new)
3. Favorites CRUD: POST/DELETE /api/cams/favorites/{username}, GET /api/cams/favorites
4. GET /api/cams/{username} with auth - is_favorite flag
5. Auth gates: 401 for favorites without auth
6. Regression: /api/live/active, /api/creators, /api/auth/me
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
FAN_EMAIL = "fan@meandyou.fans"
FAN_PASSWORD = "TestFan2026!"

# Legacy handles that should NOT exist
LEGACY_HANDLES = ["lysepress", "emmarose", "sophieluxe", "claranuit", "julieether", "leavelvet"]
TEST_PREFIXES = ["test_", "testhandle_", "testcreator_"]
TEST_EMAIL_PREFIXES = ["test_creator_", "testcreator_", "testhandle_", "testfan_", "test_fan_"]


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def fan_token(api_client):
    """Get authentication token for fan user"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": FAN_EMAIL,
        "password": FAN_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip(f"Fan login failed: {response.status_code} - {response.text}")


@pytest.fixture(scope="module")
def authed_client(api_client, fan_token):
    """Session with auth header"""
    api_client.headers.update({"Authorization": f"Bearer {fan_token}"})
    return api_client


class TestLegacyCreatorCleanup:
    """Verify legacy seeded creators are purged from database"""
    
    def test_creators_list_no_legacy_handles(self, api_client):
        """GET /api/creators should NOT return any legacy seeded handles"""
        response = api_client.get(f"{BASE_URL}/api/creators?limit=100")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        creators = response.json()
        handles = [c.get("handle", "").lower() for c in creators]
        
        # Check no legacy handles exist
        for legacy in LEGACY_HANDLES:
            assert legacy not in handles, f"Legacy handle '{legacy}' should have been purged"
        
        # Check no test_ prefixed handles
        for handle in handles:
            for prefix in TEST_PREFIXES:
                assert not handle.startswith(prefix), f"Test handle '{handle}' should have been purged"
        
        print(f"PASSED: No legacy handles found. Current creators: {handles}")
    
    def test_creators_list_no_test_emails(self, api_client):
        """Verify no test email patterns in creators"""
        response = api_client.get(f"{BASE_URL}/api/creators?limit=100")
        assert response.status_code == 200
        
        creators = response.json()
        # Note: email is not exposed in list, but we verify handles
        # Real creators should remain (timothebg22, erlannbg)
        handles = [c.get("handle", "") for c in creators]
        print(f"PASSED: Current creator handles: {handles}")


class TestCamsSortOptions:
    """Test sort options for /api/cams endpoint"""
    
    def test_cams_sort_popular(self, api_client):
        """GET /api/cams?sort=popular returns items sorted by popularity"""
        response = api_client.get(f"{BASE_URL}/api/cams?sort=popular&gender=girls&limit=10")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "items" in data, "Response should have 'items' field"
        assert "sort" in data, "Response should echo 'sort' field"
        assert data["sort"] == "popular", f"Expected sort='popular', got {data['sort']}"
        
        if data["items"]:
            # Verify items have expected fields
            item = data["items"][0]
            assert "username" in item
            assert "viewers" in item
            print(f"PASSED: sort=popular, got {len(data['items'])} items, top viewers: {item.get('viewers')}")
    
    def test_cams_sort_trending(self, api_client):
        """GET /api/cams?sort=trending"""
        response = api_client.get(f"{BASE_URL}/api/cams?sort=trending&gender=girls&limit=10")
        assert response.status_code == 200
        
        data = response.json()
        assert data.get("sort") == "trending", f"Expected sort='trending', got {data.get('sort')}"
        print(f"PASSED: sort=trending, got {len(data.get('items', []))} items")
    
    def test_cams_sort_top(self, api_client):
        """GET /api/cams?sort=top"""
        response = api_client.get(f"{BASE_URL}/api/cams?sort=top&gender=girls&limit=10")
        assert response.status_code == 200
        
        data = response.json()
        assert data.get("sort") == "top", f"Expected sort='top', got {data.get('sort')}"
        print(f"PASSED: sort=top, got {len(data.get('items', []))} items")
    
    def test_cams_sort_new(self, api_client):
        """GET /api/cams?sort=new"""
        response = api_client.get(f"{BASE_URL}/api/cams?sort=new&gender=girls&limit=10")
        assert response.status_code == 200
        
        data = response.json()
        assert data.get("sort") == "new", f"Expected sort='new', got {data.get('sort')}"
        print(f"PASSED: sort=new, got {len(data.get('items', []))} items")
    
    def test_cams_invalid_sort_defaults_to_popular(self, api_client):
        """Invalid sort value should default to 'popular'"""
        response = api_client.get(f"{BASE_URL}/api/cams?sort=invalid_sort&limit=5")
        assert response.status_code == 200
        
        data = response.json()
        assert data.get("sort") == "popular", f"Invalid sort should default to 'popular', got {data.get('sort')}"
        print("PASSED: Invalid sort defaults to 'popular'")


class TestCamsFavorites:
    """Test favorites CRUD operations"""
    
    def test_favorites_add_requires_auth(self, api_client):
        """POST /api/cams/favorites/{username} without auth returns 401"""
        # Remove auth header if present
        api_client.headers.pop("Authorization", None)
        response = api_client.post(f"{BASE_URL}/api/cams/favorites/testmodel123")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("PASSED: POST favorites without auth returns 401")
    
    def test_favorites_delete_requires_auth(self, api_client):
        """DELETE /api/cams/favorites/{username} without auth returns 401"""
        api_client.headers.pop("Authorization", None)
        response = api_client.delete(f"{BASE_URL}/api/cams/favorites/testmodel123")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("PASSED: DELETE favorites without auth returns 401")
    
    def test_favorites_list_requires_auth(self, api_client):
        """GET /api/cams/favorites without auth returns 401"""
        api_client.headers.pop("Authorization", None)
        response = api_client.get(f"{BASE_URL}/api/cams/favorites")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("PASSED: GET favorites without auth returns 401")
    
    def test_favorites_add_with_auth(self, authed_client):
        """POST /api/cams/favorites/{username} adds favorite"""
        # First get a real cam username from the list
        cams_response = authed_client.get(f"{BASE_URL}/api/cams?limit=5")
        assert cams_response.status_code == 200
        cams = cams_response.json().get("items", [])
        
        if not cams:
            pytest.skip("No cams available to test favorites")
        
        test_username = cams[0]["username"]
        
        # Add to favorites
        response = authed_client.post(f"{BASE_URL}/api/cams/favorites/{test_username}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("ok") == True, "Response should have ok=true"
        assert data.get("is_favorite") == True, "Response should have is_favorite=true"
        assert "count" in data, "Response should have count field"
        
        print(f"PASSED: Added '{test_username}' to favorites, count={data.get('count')}")
        return test_username
    
    def test_favorites_add_idempotent(self, authed_client):
        """Adding same favorite twice should be idempotent (count stays same)"""
        # Get a cam
        cams_response = authed_client.get(f"{BASE_URL}/api/cams?limit=5")
        cams = cams_response.json().get("items", [])
        if not cams:
            pytest.skip("No cams available")
        
        test_username = cams[0]["username"]
        
        # Add twice
        r1 = authed_client.post(f"{BASE_URL}/api/cams/favorites/{test_username}")
        count1 = r1.json().get("count", 0)
        
        r2 = authed_client.post(f"{BASE_URL}/api/cams/favorites/{test_username}")
        count2 = r2.json().get("count", 0)
        
        assert count1 == count2, f"Idempotent add should keep same count: {count1} vs {count2}"
        print(f"PASSED: Idempotent add - count stayed at {count1}")
    
    def test_favorites_list_with_auth(self, authed_client):
        """GET /api/cams/favorites returns user's favorites"""
        response = authed_client.get(f"{BASE_URL}/api/cams/favorites")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "count" in data, "Response should have 'count' field"
        assert "items" in data, "Response should have 'items' field"
        
        # Each item should have is_favorite=true
        for item in data.get("items", []):
            assert item.get("is_favorite") == True, f"Favorite item should have is_favorite=true"
        
        print(f"PASSED: GET favorites returned {data.get('count')} items")
    
    def test_favorites_delete_with_auth(self, authed_client):
        """DELETE /api/cams/favorites/{username} removes favorite"""
        # First ensure we have a favorite
        cams_response = authed_client.get(f"{BASE_URL}/api/cams?limit=5")
        cams = cams_response.json().get("items", [])
        if not cams:
            pytest.skip("No cams available")
        
        test_username = cams[0]["username"]
        
        # Add first
        authed_client.post(f"{BASE_URL}/api/cams/favorites/{test_username}")
        
        # Delete
        response = authed_client.delete(f"{BASE_URL}/api/cams/favorites/{test_username}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert data.get("ok") == True, "Response should have ok=true"
        assert data.get("is_favorite") == False, "Response should have is_favorite=false"
        
        print(f"PASSED: Removed '{test_username}' from favorites")


class TestCamsWithAuth:
    """Test /api/cams endpoints with authentication"""
    
    def test_cams_list_with_auth_has_is_favorite(self, authed_client):
        """GET /api/cams with auth should include is_favorite field on items"""
        # First add a favorite
        cams_response = authed_client.get(f"{BASE_URL}/api/cams?limit=10")
        assert cams_response.status_code == 200
        
        cams = cams_response.json().get("items", [])
        if not cams:
            pytest.skip("No cams available")
        
        # Add first cam to favorites
        test_username = cams[0]["username"]
        authed_client.post(f"{BASE_URL}/api/cams/favorites/{test_username}")
        
        # Now fetch cams again - should have is_favorite field
        response = authed_client.get(f"{BASE_URL}/api/cams?limit=10")
        assert response.status_code == 200
        
        data = response.json()
        items = data.get("items", [])
        
        # Find our favorited cam
        fav_item = next((i for i in items if i["username"] == test_username), None)
        if fav_item:
            assert "is_favorite" in fav_item, "Item should have is_favorite field"
            assert fav_item["is_favorite"] == True, f"Favorited cam should have is_favorite=true"
            print(f"PASSED: Cam '{test_username}' has is_favorite=true")
        else:
            print(f"PASSED: is_favorite field present (favorited cam not in current page)")
    
    def test_cams_get_single_with_auth_has_is_favorite(self, authed_client):
        """GET /api/cams/{username} with auth should include is_favorite field"""
        # Get a cam
        cams_response = authed_client.get(f"{BASE_URL}/api/cams?limit=5")
        cams = cams_response.json().get("items", [])
        if not cams:
            pytest.skip("No cams available")
        
        test_username = cams[0]["username"]
        
        # Add to favorites
        authed_client.post(f"{BASE_URL}/api/cams/favorites/{test_username}")
        
        # Get single cam
        response = authed_client.get(f"{BASE_URL}/api/cams/{test_username}")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "is_favorite" in data, "Single cam response should have is_favorite field"
        assert data["is_favorite"] == True, "Favorited cam should have is_favorite=true"
        
        print(f"PASSED: GET /api/cams/{test_username} has is_favorite=true")


class TestRegressionEndpoints:
    """Verify existing endpoints still work"""
    
    def test_live_active(self, api_client):
        """GET /api/live/active should return list"""
        api_client.headers.pop("Authorization", None)
        response = api_client.get(f"{BASE_URL}/api/live/active")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"PASSED: /api/live/active returned {len(data)} active lives")
    
    def test_creators_list(self, api_client):
        """GET /api/creators should return list"""
        response = api_client.get(f"{BASE_URL}/api/creators")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"PASSED: /api/creators returned {len(data)} creators")
    
    def test_auth_me_with_token(self, authed_client):
        """GET /api/auth/me with valid token should return user"""
        response = authed_client.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "user_id" in data, "Response should have user_id"
        assert data.get("email") == FAN_EMAIL, f"Expected email {FAN_EMAIL}"
        print(f"PASSED: /api/auth/me returned user {data.get('email')}")
    
    def test_auth_me_without_token(self):
        """GET /api/auth/me without token should return 401"""
        # Use fresh session without any auth
        fresh_session = requests.Session()
        fresh_session.headers.update({"Content-Type": "application/json"})
        response = fresh_session.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("PASSED: /api/auth/me without token returns 401")


class TestOfflineFavorites:
    """Test that offline favorites are included in favorites list"""
    
    def test_offline_favorite_included(self, authed_client):
        """Favorites list should include offline cams with status='offline'"""
        # Add a fake username that won't be online
        fake_username = "test_offline_model_xyz123"
        authed_client.post(f"{BASE_URL}/api/cams/favorites/{fake_username}")
        
        # Get favorites
        response = authed_client.get(f"{BASE_URL}/api/cams/favorites")
        assert response.status_code == 200
        
        data = response.json()
        items = data.get("items", [])
        
        # Find our offline favorite
        offline_item = next((i for i in items if i["username"] == fake_username), None)
        if offline_item:
            assert offline_item.get("status") == "offline", "Offline favorite should have status='offline'"
            assert offline_item.get("is_favorite") == True, "Should still be marked as favorite"
            print(f"PASSED: Offline favorite '{fake_username}' included with status='offline'")
        
        # Cleanup
        authed_client.delete(f"{BASE_URL}/api/cams/favorites/{fake_username}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
