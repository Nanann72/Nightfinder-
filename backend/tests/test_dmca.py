"""
DMCA Takedown API Tests - Iteration 47
Tests for:
- POST /api/dmca/submit (public form submission)
- GET /api/admin/dmca (admin list)
- PATCH /api/admin/dmca/{report_id} (admin update status)
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
FAN_EMAIL = "fan@meandyou.fans"
FAN_PASSWORD = "TestFan2026!"
ADMIN_EMAIL = "admin@meandyou.fans"
ADMIN_PASSWORD = "Admin2026!"


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def admin_token(api_client):
    """Get admin authentication token"""
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    pytest.skip("Admin authentication failed - skipping admin tests")


@pytest.fixture(scope="module")
def admin_client(api_client, admin_token):
    """Session with admin auth header"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {admin_token}"
    })
    return session


class TestDMCAPublicSubmit:
    """Tests for POST /api/dmca/submit - public form (no auth required)"""
    
    def test_dmca_submit_valid_payload(self, api_client):
        """Test successful DMCA submission with all required fields"""
        unique_id = uuid.uuid4().hex[:8]
        payload = {
            "claimant_name": f"Test Claimant {unique_id}",
            "claimant_email": f"test_{unique_id}@example.com",
            "claimant_company": "Test Company",
            "claimant_role": "self",
            "target_url": f"https://meandyou.fans/createur/test_{unique_id}",
            "target_creator": "@test_creator",
            "description": "This is a test DMCA report for automated testing. The content violates my copyright.",
            "original_work_url": "https://example.com/original-work",
            "sworn_statement": True,
            "accept_perjury": True
        }
        
        response = api_client.post(f"{BASE_URL}/api/dmca/submit", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("ok") is True
        assert "report_id" in data
        assert len(data["report_id"]) > 0
        print(f"✓ DMCA submission successful, report_id: {data['report_id']}")
        return data["report_id"]
    
    def test_dmca_submit_missing_sworn_statement(self, api_client):
        """Test DMCA submission fails when sworn_statement is False"""
        payload = {
            "claimant_name": "Test Claimant",
            "claimant_email": "test@example.com",
            "target_url": "https://meandyou.fans/createur/test",
            "description": "Test description for DMCA report",
            "sworn_statement": False,  # Must be True
            "accept_perjury": True
        }
        
        response = api_client.post(f"{BASE_URL}/api/dmca/submit", json=payload)
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        print("✓ DMCA submission correctly rejected when sworn_statement=False")
    
    def test_dmca_submit_missing_accept_perjury(self, api_client):
        """Test DMCA submission fails when accept_perjury is False"""
        payload = {
            "claimant_name": "Test Claimant",
            "claimant_email": "test@example.com",
            "target_url": "https://meandyou.fans/createur/test",
            "description": "Test description for DMCA report",
            "sworn_statement": True,
            "accept_perjury": False  # Must be True
        }
        
        response = api_client.post(f"{BASE_URL}/api/dmca/submit", json=payload)
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        print("✓ DMCA submission correctly rejected when accept_perjury=False")
    
    def test_dmca_submit_both_flags_false(self, api_client):
        """Test DMCA submission fails when both flags are False"""
        payload = {
            "claimant_name": "Test Claimant",
            "claimant_email": "test@example.com",
            "target_url": "https://meandyou.fans/createur/test",
            "description": "Test description for DMCA report",
            "sworn_statement": False,
            "accept_perjury": False
        }
        
        response = api_client.post(f"{BASE_URL}/api/dmca/submit", json=payload)
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        print("✓ DMCA submission correctly rejected when both flags are False")
    
    def test_dmca_submit_minimal_valid_payload(self, api_client):
        """Test DMCA submission with only required fields"""
        unique_id = uuid.uuid4().hex[:8]
        payload = {
            "claimant_name": f"Minimal Test {unique_id}",
            "claimant_email": f"minimal_{unique_id}@example.com",
            "target_url": f"https://meandyou.fans/content/{unique_id}",
            "description": "Minimal test DMCA report with only required fields.",
            "sworn_statement": True,
            "accept_perjury": True
        }
        
        response = api_client.post(f"{BASE_URL}/api/dmca/submit", json=payload)
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("ok") is True
        assert "report_id" in data
        print(f"✓ Minimal DMCA submission successful, report_id: {data['report_id']}")


class TestDMCAAdminList:
    """Tests for GET /api/admin/dmca - admin only"""
    
    def test_admin_dmca_list_requires_auth(self, api_client):
        """Test that DMCA list requires authentication"""
        response = api_client.get(f"{BASE_URL}/api/admin/dmca")
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Admin DMCA list correctly requires authentication")
    
    def test_admin_dmca_list_success(self, admin_client):
        """Test admin can list DMCA reports"""
        response = admin_client.get(f"{BASE_URL}/api/admin/dmca")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "items" in data
        assert "counts" in data
        assert "total" in data
        assert isinstance(data["items"], list)
        assert isinstance(data["counts"], dict)
        print(f"✓ Admin DMCA list successful, total: {data['total']}, counts: {data['counts']}")
    
    def test_admin_dmca_list_filter_by_status(self, admin_client):
        """Test admin can filter DMCA reports by status"""
        for status in ["pending", "in_review", "approved", "rejected"]:
            response = admin_client.get(f"{BASE_URL}/api/admin/dmca", params={"status": status})
            
            assert response.status_code == 200, f"Expected 200 for status={status}, got {response.status_code}"
            data = response.json()
            # All items should have the filtered status
            for item in data["items"]:
                assert item["status"] == status, f"Expected status={status}, got {item['status']}"
        print("✓ Admin DMCA list filtering by status works correctly")


class TestDMCAAdminUpdate:
    """Tests for PATCH /api/admin/dmca/{report_id} - admin only"""
    
    @pytest.fixture
    def test_report_id(self, api_client):
        """Create a test DMCA report for update tests"""
        unique_id = uuid.uuid4().hex[:8]
        payload = {
            "claimant_name": f"Update Test {unique_id}",
            "claimant_email": f"update_{unique_id}@example.com",
            "target_url": f"https://meandyou.fans/test/{unique_id}",
            "description": "Test report for admin update testing",
            "sworn_statement": True,
            "accept_perjury": True
        }
        response = api_client.post(f"{BASE_URL}/api/dmca/submit", json=payload)
        assert response.status_code == 200
        return response.json()["report_id"]
    
    def test_admin_dmca_update_requires_auth(self, api_client, test_report_id):
        """Test that DMCA update requires authentication"""
        response = api_client.patch(
            f"{BASE_URL}/api/admin/dmca/{test_report_id}",
            json={"status": "in_review"}
        )
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Admin DMCA update correctly requires authentication")
    
    def test_admin_dmca_update_status_in_review(self, admin_client, test_report_id):
        """Test admin can update DMCA report status to in_review"""
        response = admin_client.patch(
            f"{BASE_URL}/api/admin/dmca/{test_report_id}",
            json={"status": "in_review"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("ok") is True
        print(f"✓ Admin DMCA update to in_review successful for {test_report_id}")
    
    def test_admin_dmca_update_notes(self, admin_client, test_report_id):
        """Test admin can add notes to DMCA report"""
        notes = "Admin notes: Investigating this report. Contacted claimant for more info."
        response = admin_client.patch(
            f"{BASE_URL}/api/admin/dmca/{test_report_id}",
            json={"admin_notes": notes}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"✓ Admin DMCA notes update successful for {test_report_id}")
    
    def test_admin_dmca_update_status_approved(self, admin_client, test_report_id):
        """Test admin can approve DMCA report"""
        response = admin_client.patch(
            f"{BASE_URL}/api/admin/dmca/{test_report_id}",
            json={"status": "approved", "admin_notes": "Content removed. Claimant notified."}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        print(f"✓ Admin DMCA approval successful for {test_report_id}")
    
    def test_admin_dmca_update_nonexistent_report(self, admin_client):
        """Test admin update fails for non-existent report"""
        fake_id = "nonexistent_report_12345"
        response = admin_client.patch(
            f"{BASE_URL}/api/admin/dmca/{fake_id}",
            json={"status": "in_review"}
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ Admin DMCA update correctly returns 404 for non-existent report")


class TestDMCAIntegration:
    """End-to-end integration tests for DMCA workflow"""
    
    def test_full_dmca_workflow(self, api_client, admin_client):
        """Test complete DMCA workflow: submit -> list -> update -> verify"""
        # 1. Submit a new DMCA report
        unique_id = uuid.uuid4().hex[:8]
        submit_payload = {
            "claimant_name": f"Integration Test {unique_id}",
            "claimant_email": f"integration_{unique_id}@example.com",
            "claimant_company": "Integration Test Co",
            "claimant_role": "agent",
            "target_url": f"https://meandyou.fans/integration/{unique_id}",
            "target_creator": "@integration_test",
            "description": "Full integration test for DMCA workflow",
            "original_work_url": "https://example.com/original",
            "sworn_statement": True,
            "accept_perjury": True
        }
        
        submit_response = api_client.post(f"{BASE_URL}/api/dmca/submit", json=submit_payload)
        assert submit_response.status_code == 200
        report_id = submit_response.json()["report_id"]
        print(f"✓ Step 1: DMCA report submitted, id: {report_id}")
        
        # 2. Admin lists reports and finds the new one
        list_response = admin_client.get(f"{BASE_URL}/api/admin/dmca")
        assert list_response.status_code == 200
        items = list_response.json()["items"]
        found = any(r["report_id"] == report_id for r in items)
        assert found, f"Report {report_id} not found in admin list"
        print(f"✓ Step 2: Report found in admin list")
        
        # 3. Admin updates status to in_review
        update_response = admin_client.patch(
            f"{BASE_URL}/api/admin/dmca/{report_id}",
            json={"status": "in_review", "admin_notes": "Under investigation"}
        )
        assert update_response.status_code == 200
        print(f"✓ Step 3: Status updated to in_review")
        
        # 4. Verify status change in list
        list_response2 = admin_client.get(f"{BASE_URL}/api/admin/dmca", params={"status": "in_review"})
        assert list_response2.status_code == 200
        in_review_items = list_response2.json()["items"]
        found_in_review = any(r["report_id"] == report_id for r in in_review_items)
        assert found_in_review, f"Report {report_id} not found in in_review filter"
        print(f"✓ Step 4: Report correctly appears in in_review filter")
        
        # 5. Admin rejects the report
        reject_response = admin_client.patch(
            f"{BASE_URL}/api/admin/dmca/{report_id}",
            json={"status": "rejected", "admin_notes": "Insufficient evidence provided"}
        )
        assert reject_response.status_code == 200
        print(f"✓ Step 5: Report rejected successfully")
        
        # 6. Verify final status
        list_response3 = admin_client.get(f"{BASE_URL}/api/admin/dmca", params={"status": "rejected"})
        assert list_response3.status_code == 200
        rejected_items = list_response3.json()["items"]
        found_rejected = any(r["report_id"] == report_id for r in rejected_items)
        assert found_rejected, f"Report {report_id} not found in rejected filter"
        print(f"✓ Step 6: Report correctly appears in rejected filter")
        
        print("✓ Full DMCA workflow integration test passed!")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
