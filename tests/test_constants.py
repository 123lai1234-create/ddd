"""
Tests for src.constants — shared bioinformatics constants.
"""

from src.constants import AMINO_ACIDS, N_AA, AA_TO_IDX, THREE_TO_ONE, STANDARD_AA


class TestAminoAcidConstants:
    def test_amino_acids_count(self):
        assert len(AMINO_ACIDS) == 20

    def test_n_aa_matches(self):
        assert N_AA == len(AMINO_ACIDS)

    def test_aa_to_idx_complete(self):
        assert len(AA_TO_IDX) == 20
        for i, aa in enumerate(AMINO_ACIDS):
            assert AA_TO_IDX[aa] == i

    def test_standard_aa_is_frozenset(self):
        assert isinstance(STANDARD_AA, frozenset)
        assert len(STANDARD_AA) == 20

    def test_all_single_char(self):
        for aa in AMINO_ACIDS:
            assert len(aa) == 1 and aa.isalpha() and aa.isupper()


class TestThreeToOne:
    def test_all_20_mapped(self):
        assert len(THREE_TO_ONE) == 20

    def test_common_mappings(self):
        assert THREE_TO_ONE["ALA"] == "A"
        assert THREE_TO_ONE["GLY"] == "G"
        assert THREE_TO_ONE["TRP"] == "W"

    def test_values_match_amino_acids(self):
        for one_letter in THREE_TO_ONE.values():
            assert one_letter in STANDARD_AA
