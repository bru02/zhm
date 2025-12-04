drop table if exists ApartmentService;
drop table if exists Service;
drop table if exists Apartment;
drop table if exists Resident;
drop table if exists Building;

create table Building
(
    BuildingId   int         not null identity primary key,
    BuildingName varchar(50) not null,
);

create table Resident
(
    ResidentId varchar(10) not null primary key,
    Name       varchar(50) not null,
    Email      varchar(50) not null,
    BirthYear  int         not null
);

create table Apartment
(
    ApartmentId int not null primary key,
    BuildingId  int not null foreign key references Building (BuildingId),
    ResidentId  varchar(10) foreign key references Resident (ResidentId),
    Floor       int not null,
    Size        int not null,
    UnitPrice   int not null,
);

insert Resident
select distinct personid, name, email, birth_year
from imported_apartments;

insert Building
select distinct building_name
from imported_apartments

insert Apartment
select apartment_number, BuildingId, R.ResidentId, imported_apartments.floor, square_meters, price_per_sqm
from imported_apartments
left join Building B on imported_apartments.building_name = B.BuildingName
left join Resident R on R.ResidentId = imported_apartments.personid

create table Service
(
    ServiceId   int        not null identity primary key,
    ServiceName varchar(7) not null
)

create table ApartmentService
(
    ServiceId   int not null foreign key references Service (ServiceId),
    ApartmentId int not null foreign key references Apartment (ApartmentId),
    primary key (ServiceId, ApartmentId)
)

insert Service
select distinct value
from imported_apartments
cross apply string_split(replace(services, ' ', ''), ',')

insert ApartmentService
select distinct ServiceId, ApartmentId
from imported_apartments
cross apply string_split(replace(services, ' ', ''), ',')
join        Service S on S.ServiceName = value
join        Apartment A on A.ApartmentId = apartment_number


alter table Resident
    drop constraint if exists IsMajor;
alter table Resident
    add constraint IsMajor check (BirthYear <= year(getdate()) - 18)

go;
create or alter function ApartmentFee(@Unitprice int, @SquareMeters int) returns float as
begin
    return @Unitprice * @SquareMeters * 1.1
end

go;

select cusman.ApartmentFee(100, 5)

select Building.BuildingName, CountOfApartments, AchievableRentalFees from (select BuildingId, count(*) as CountOfApartments, sum(cusman.ApartmentFee(UnitPrice, Size)) as AchievableRentalFees
from Apartment X
group by BuildingId
) T
join Building on Building.BuildingId = T.BuildingId
order by CountOfApartments desc

drop view if exists vmBuildingApts;
go;
create view vmBuildingApts as
select Building.BuildingName, CountOfApartments, AchievableRentalFees from (select BuildingId, count(*) as CountOfApartments, sum(cusman.ApartmentFee(UnitPrice, Size)) as AchievableRentalFees
from Apartment X
group by BuildingId
) T
join Building on Building.BuildingId = T.BuildingId
go;
select *
from vmBuildingApts;

declare @newApts Xml;

set @newApts = '
<Apartments>
    <Apartment>
        <BuildingName>Pine Ridge</BuildingName>
        <ApartmentNumber>310</ApartmentNumber>
        <Floor>5</Floor>
        <Size>146</Size>
        <UnitPrice>28</UnitPrice>
    </Apartment>
    <Apartment>
        <BuildingName>Pine Ridge</BuildingName>
        <ApartmentNumber>311</ApartmentNumber>
        <Floor>5</Floor>
        <Size>129</Size>
        <UnitPrice>12</UnitPrice>
    </Apartment>
    <Apartment>
        <BuildingName>Pine Ridge</BuildingName>
        <ApartmentNumber>312</ApartmentNumber>
        <Floor>3</Floor>
        <Size>104</Size>
        <UnitPrice>26</UnitPrice>
    </Apartment>
    <Apartment>
        <BuildingName>Pine Ridge</BuildingName>
        <ApartmentNumber>303</ApartmentNumber>
        <Floor>3</Floor>
        <Size>149</Size>
        <UnitPrice>22</UnitPrice>
    </Apartment>
    <Apartment>
        <BuildingName>Pine Ridge</BuildingName>
        <ApartmentNumber>304</ApartmentNumber>
        <Floor>1</Floor>
        <Size>128</Size>
        <UnitPrice>17</UnitPrice>
    </Apartment>
    <Apartment>
        <BuildingName>River View</BuildingName>
        <ApartmentNumber>305</ApartmentNumber>
        <Floor>5</Floor>
        <Size>104</Size>
        <UnitPrice>28</UnitPrice>
    </Apartment>
    <Apartment>
        <BuildingName>River View</BuildingName>
        <ApartmentNumber>306</ApartmentNumber>
        <Floor>2</Floor>
        <Size>102</Size>
        <UnitPrice>28</UnitPrice>
    </Apartment>
    <Apartment>
        <BuildingName>River View</BuildingName>
        <ApartmentNumber>307</ApartmentNumber>
        <Floor>3</Floor>
        <Size>136</Size>
        <UnitPrice>26</UnitPrice>
    </Apartment>
    <Apartment>
        <BuildingName>River View</BuildingName>
        <ApartmentNumber>308</ApartmentNumber>
        <Floor>3</Floor>
        <Size>119</Size>
        <UnitPrice>13</UnitPrice>
    </Apartment>
    <Apartment>
        <BuildingName>River View</BuildingName>
        <ApartmentNumber>309</ApartmentNumber>
        <Floor>1</Floor>
        <Size>138</Size>
        <UnitPrice>18</UnitPrice>
    </Apartment>
</Apartments>';

drop table if exists #NewApts
select A.value('BuildingName[1]', 'nvarchar(50)') as BuildingName,
       A.value('Floor[1]', 'int')                 as Floor,
       A.value('ApartmentNumber[1]', 'int')       as ApartmentNumber,
       A.value('Size[1]', 'int')                  as Size,
       A.value('UnitPrice[1]', 'int')             as UnitPrice
into #NewApts
from @newApts.nodes('Apartments/Apartment') as T(A)

insert Building
select distinct BuildingName
from #NewApts
where BuildingName not in (select BuildingName from Building)

insert Apartment
select ApartmentNumber, BuildingId, null, Floor, Size, UnitPrice
from #NewApts
join Building on #NewApts.BuildingName = Building.BuildingName
where ApartmentNumber not in (select ApartmentId from Apartment)
