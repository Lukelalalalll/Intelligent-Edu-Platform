from pdf2md import convert_pdf_to_md
import os
filename = "Home_Energy_Management_Systems_A_Review_of_the_Concept_Architecture_and_Scheduling_Strategies.pdf"
base_name = os.path.splitext(filename)[0]
md_path = "Home_Energy_Management_Systems_A_Review_of_the_Concept_Architecture_and_Scheduling_Strategies.md"
try:
    convert_pdf_to_md("Home_Energy_Management_Systems_A_Review_of_the_Concept_Architecture_and_Scheduling_Strategies.pdf", md_path)
    filepath = md_path
    filename = os.path.basename(md_path)
    del convert_pdf_to_md
except Exception as e:
    print(e)