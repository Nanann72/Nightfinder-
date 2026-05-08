"""
Test suite for Stripchat cams integration and HLS proxy
Tests: /api/cams, /api/cams/{username}, /api/hls/{b64url}
"""
import pytest
import requests
import os
import base64
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestCamsEndpoints:
    """Tests for /api/cams and /api/cams/{username}"""
    
    def test_cams_list_default(self):
        """GET /api/cams returns list of cams with expected structure"""
        response = requests.get(f"{BASE_URL}/api/cams?limit=5")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "total" in data, "Response should have 'total' field"
        assert "count" in data, "Response should have 'count' field"
        assert "items" in data, "Response should have 'items' field"
        assert isinstance(data["items"], list), "items should be a list"
        
        if len(data["items"]) > 0:
            cam = data["items"][0]
            # Verify cam card structure
            assert "model_id" in cam, "Cam should have model_id"
            assert "username" in cam, "Cam should have username"
            assert "thumb" in cam, "Cam should have thumb"
            assert "gender" in cam, "Cam should have gender"
            assert "viewers" in cam, "Cam should have viewers"
            assert "is_hd" in cam, "Cam should have is_hd"
            assert "hls" in cam, "Cam should have hls"
            
            # HLS URLs must be proxied paths
            if cam["hls"]:
                assert cam["hls"].startswith("/api/hls/"), f"HLS URL should be proxied, got: {cam['hls']}"
            if cam.get("hls_low"):
                assert cam["hls_low"].startswith("/api/hls/"), f"HLS low URL should be proxied"
        
        print(f"✓ GET /api/cams returned {data['count']} cams (total: {data['total']})")
    
    def test_cams_list_gender_girls(self):
        """GET /api/cams?gender=girls returns female cams"""
        response = requests.get(f"{BASE_URL}/api/cams?limit=5&gender=girls")
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        print(f"✓ GET /api/cams?gender=girls returned {data['count']} cams")
    
    def test_cams_list_gender_couples(self):
        """GET /api/cams?gender=couples returns couple cams"""
        response = requests.get(f"{BASE_URL}/api/cams?limit=5&gender=couples")
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        print(f"✓ GET /api/cams?gender=couples returned {data['count']} cams")
    
    def test_cams_list_gender_trans(self):
        """GET /api/cams?gender=trans returns trans cams"""
        response = requests.get(f"{BASE_URL}/api/cams?limit=5&gender=trans")
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        print(f"✓ GET /api/cams?gender=trans returned {data['count']} cams")
    
    def test_cams_list_gender_men(self):
        """GET /api/cams?gender=men returns male cams"""
        response = requests.get(f"{BASE_URL}/api/cams?limit=5&gender=men")
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        print(f"✓ GET /api/cams?gender=men returned {data['count']} cams")
    
    def test_cams_cache_consistency(self):
        """Two quick calls to /api/cams should return consistent cached results"""
        response1 = requests.get(f"{BASE_URL}/api/cams?limit=5&gender=girls")
        assert response1.status_code == 200
        data1 = response1.json()
        
        # Second call within cache TTL (25s)
        response2 = requests.get(f"{BASE_URL}/api/cams?limit=5&gender=girls")
        assert response2.status_code == 200
        data2 = response2.json()
        
        # Should return same data (cached)
        assert data1["total"] == data2["total"], "Cached results should be consistent"
        if len(data1["items"]) > 0 and len(data2["items"]) > 0:
            assert data1["items"][0]["model_id"] == data2["items"][0]["model_id"], "First item should be same (cached)"
        
        print("✓ Cache consistency verified - two calls returned same data")
    
    def test_cams_get_by_username_not_found(self):
        """GET /api/cams/{username} returns 404 for non-existent model"""
        response = requests.get(f"{BASE_URL}/api/cams/nonexistent_user_xyz_12345")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ GET /api/cams/nonexistent returns 404")
    
    def test_cams_get_by_username_from_list(self):
        """GET /api/cams/{username} returns cam for known username from list"""
        # First get a list to find a valid username
        list_response = requests.get(f"{BASE_URL}/api/cams?limit=5")
        assert list_response.status_code == 200
        data = list_response.json()
        
        if len(data["items"]) == 0:
            pytest.skip("No cams available to test")
        
        username = data["items"][0]["username"]
        
        # Now fetch by username
        response = requests.get(f"{BASE_URL}/api/cams/{username}")
        # May return 200 or 404 depending on if model is still online
        assert response.status_code in [200, 404], f"Expected 200 or 404, got {response.status_code}"
        
        if response.status_code == 200:
            cam = response.json()
            assert cam["username"].lower() == username.lower(), "Username should match"
            print(f"✓ GET /api/cams/{username} returned cam data")
        else:
            print(f"✓ GET /api/cams/{username} returned 404 (model went offline)")


class TestHlsProxy:
    """Tests for /api/hls/{b64url} proxy endpoint"""
    
    def test_hls_proxy_invalid_base64(self):
        """GET /api/hls/{invalid_b64} returns 400"""
        response = requests.get(f"{BASE_URL}/api/hls/not_valid_base64!!!")
        assert response.status_code == 400, f"Expected 400 for invalid base64, got {response.status_code}"
        print("✓ Invalid base64 returns 400")
    
    def test_hls_proxy_non_whitelisted_host(self):
        """GET /api/hls/{b64url} with non-whitelisted host returns 403"""
        # Encode a URL to a non-whitelisted host
        bad_url = "https://evil.com/stream.m3u8"
        b64 = base64.urlsafe_b64encode(bad_url.encode()).decode().rstrip("=")
        
        response = requests.get(f"{BASE_URL}/api/hls/{b64}")
        assert response.status_code == 403, f"Expected 403 for non-whitelisted host, got {response.status_code}"
        print("✓ Non-whitelisted host returns 403")
    
    def test_hls_proxy_manifest_fetch(self):
        """GET /api/hls/{b64url} for master playlist returns 200 with correct content-type and CORS"""
        # First get a cam with HLS URL
        list_response = requests.get(f"{BASE_URL}/api/cams?limit=5")
        assert list_response.status_code == 200
        data = list_response.json()
        
        if len(data["items"]) == 0:
            pytest.skip("No cams available to test HLS proxy")
        
        # Find a cam with HLS URL
        cam = None
        for item in data["items"]:
            if item.get("hls"):
                cam = item
                break
        
        if not cam:
            pytest.skip("No cam with HLS URL found")
        
        hls_path = cam["hls"]
        assert hls_path.startswith("/api/hls/"), f"HLS path should start with /api/hls/, got: {hls_path}"
        
        # Fetch the manifest through proxy
        response = requests.get(f"{BASE_URL}{hls_path}")
        
        # May return 200 or 502 if upstream is unavailable
        if response.status_code == 502:
            print("✓ HLS proxy returned 502 (upstream unavailable) - expected for some streams")
            return
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        # Check content-type
        content_type = response.headers.get("content-type", "").lower()
        assert "mpegurl" in content_type or "m3u8" in hls_path, f"Expected mpegurl content-type, got: {content_type}"
        
        # Check CORS header
        cors = response.headers.get("access-control-allow-origin", "")
        assert cors == "*", f"Expected CORS header '*', got: {cors}"
        
        # Check that segment URIs are rewritten
        body = response.text
        assert "#EXTM3U" in body, "Response should be a valid m3u8 playlist"
        
        # Check for rewritten URIs (should contain /api/hls/)
        lines = body.strip().split("\n")
        segment_lines = [l for l in lines if l.strip() and not l.startswith("#")]
        
        if segment_lines:
            for seg in segment_lines[:3]:  # Check first 3 segments
                assert seg.startswith("/api/hls/"), f"Segment URI should be rewritten, got: {seg}"
        
        print(f"✓ HLS manifest fetched successfully, CORS=*, URIs rewritten")
    
    def test_hls_proxy_segment_fetch(self):
        """GET /api/hls/{b64url} for segment returns video bytes with CORS"""
        # First get a cam with HLS URL
        list_response = requests.get(f"{BASE_URL}/api/cams?limit=5")
        assert list_response.status_code == 200
        data = list_response.json()
        
        if len(data["items"]) == 0:
            pytest.skip("No cams available to test HLS segment")
        
        # Find a cam with HLS URL
        cam = None
        for item in data["items"]:
            if item.get("hls"):
                cam = item
                break
        
        if not cam:
            pytest.skip("No cam with HLS URL found")
        
        hls_path = cam["hls"]
        
        # Fetch the manifest
        manifest_response = requests.get(f"{BASE_URL}{hls_path}")
        if manifest_response.status_code != 200:
            pytest.skip("Could not fetch manifest")
        
        body = manifest_response.text
        lines = body.strip().split("\n")
        
        # Find first segment URI (non-comment, non-empty line that starts with /api/hls/)
        segment_uri = None
        for line in lines:
            stripped = line.strip()
            if stripped and not stripped.startswith("#") and stripped.startswith("/api/hls/"):
                segment_uri = stripped
                break
        
        if not segment_uri:
            # Maybe it's a master playlist pointing to sub-playlists
            # Try to find a sub-playlist
            for line in lines:
                stripped = line.strip()
                if stripped and not stripped.startswith("#") and stripped.startswith("/api/hls/"):
                    # Fetch sub-playlist
                    sub_response = requests.get(f"{BASE_URL}{stripped}")
                    if sub_response.status_code == 200:
                        sub_body = sub_response.text
                        sub_lines = sub_body.strip().split("\n")
                        for sub_line in sub_lines:
                            sub_stripped = sub_line.strip()
                            if sub_stripped and not sub_stripped.startswith("#") and sub_stripped.startswith("/api/hls/"):
                                segment_uri = sub_stripped
                                break
                    if segment_uri:
                        break
        
        if not segment_uri:
            print("✓ No segment URIs found in manifest (may be master playlist only)")
            return
        
        # Fetch the segment
        segment_response = requests.get(f"{BASE_URL}{segment_uri}")
        
        if segment_response.status_code == 502:
            print("✓ Segment fetch returned 502 (upstream unavailable)")
            return
        
        assert segment_response.status_code == 200, f"Expected 200, got {segment_response.status_code}"
        
        # Check CORS
        cors = segment_response.headers.get("access-control-allow-origin", "")
        assert cors == "*", f"Expected CORS header '*', got: {cors}"
        
        # Check content-type (should be video/mp4, video/MP2T, mpegurl for sub-playlists, or similar)
        content_type = segment_response.headers.get("content-type", "").lower()
        valid_types = ["video", "mp2t", "octet", "mpegurl"]
        assert any(t in content_type for t in valid_types), f"Expected video/mpegurl content-type, got: {content_type}"
        
        # Check we got some bytes
        assert len(segment_response.content) > 0, "Segment should have content"
        
        print(f"✓ Segment/sub-playlist fetched successfully, {len(segment_response.content)} bytes, CORS=*, type={content_type}")
    
    def test_hls_proxy_ext_x_map_rewrite(self):
        """Verify EXT-X-MAP URI attributes are rewritten in manifest"""
        # Get a cam with HLS
        list_response = requests.get(f"{BASE_URL}/api/cams?limit=5")
        assert list_response.status_code == 200
        data = list_response.json()
        
        if len(data["items"]) == 0:
            pytest.skip("No cams available")
        
        cam = None
        for item in data["items"]:
            if item.get("hls"):
                cam = item
                break
        
        if not cam:
            pytest.skip("No cam with HLS URL found")
        
        hls_path = cam["hls"]
        manifest_response = requests.get(f"{BASE_URL}{hls_path}")
        
        if manifest_response.status_code != 200:
            pytest.skip("Could not fetch manifest")
        
        body = manifest_response.text
        
        # Check if there are any EXT-X-MAP tags with URI attributes
        if 'EXT-X-MAP' in body and 'URI="' in body:
            # All URI attributes should be rewritten to /api/hls/
            import re
            uri_matches = re.findall(r'URI="([^"]+)"', body)
            for uri in uri_matches:
                assert uri.startswith("/api/hls/"), f"EXT-X-MAP URI should be rewritten, got: {uri}"
            print(f"✓ EXT-X-MAP URIs rewritten correctly ({len(uri_matches)} found)")
        else:
            print("✓ No EXT-X-MAP tags with URI in manifest (OK)")


class TestRegressionEndpoints:
    """Regression tests for existing endpoints"""
    
    def test_live_config(self):
        """GET /api/live/config still works"""
        response = requests.get(f"{BASE_URL}/api/live/config")
        assert response.status_code == 200
        data = response.json()
        assert "enabled" in data
        print(f"✓ GET /api/live/config works (enabled={data['enabled']})")
    
    def test_live_active(self):
        """GET /api/live/active still works"""
        response = requests.get(f"{BASE_URL}/api/live/active")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/live/active works ({len(data)} active lives)")
    
    def test_creators_list(self):
        """GET /api/creators still works"""
        response = requests.get(f"{BASE_URL}/api/creators?limit=5")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/creators works ({len(data)} creators)")
    
    def test_auth_me_unauthenticated(self):
        """GET /api/auth/me returns 401 when not authenticated"""
        response = requests.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 401
        print("✓ GET /api/auth/me returns 401 when unauthenticated")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
